#!/usr/bin/env python3
r"""
Dá às fotos das coleções (bucket público "fotos") um nome impossível de adivinhar (2026-11-28).

Antes: fotos/<dia>/<id_curto>.jpg. Como o bucket é público e o id_curto vai nos links /c/<id>, quem soubesse o id
chegava à foto original. Agora: fotos/<dia>/<id_curto>-<token>.jpg, com um token aleatório de 32 caracteres hex
(o mesmo formato que o publicar_plataforma.py passa a usar).

Para cada linha de feed_dia com imagem_url no formato antigo, por esta ordem:
  1. copia o ficheiro para o nome novo (Storage, /object/copy) e confirma que o novo responde 200;
  2. atualiza feed_dia.imagem_url (só se a linha ainda tiver o URL antigo);
  3. só depois apaga o ficheiro antigo e confirma que dá 400/404.
Se um passo falha, a linha fica como estava (no passo 3, o ficheiro antigo fica e o script avisa).
Linhas já no formato novo são saltadas (pode correr-se outra vez). Ficheiros do bucket que não são fotos de
coleções (ex.: reel-click/…) não são tocados. Escreve um registo JSON antigo → novo (sem chaves) para --registo.

Por omissão NÃO muda nada: mostra o que faria. Para executar: --aplicar.
Só biblioteca padrão (Python 3.9+). Nunca imprime a chave.

Uso:
  python scripts\migrar_fotos_token.py --url https://<ref>.supabase.co --key-file "<ficheiro com a service role key>" \
      [--aplicar] [--registo migracao_fotos.json]

Códigos de saída: 0 ok · 1 erro do servidor · 2 argumentos · 3 rede · 4 credenciais · 5 alguma linha falhou.
"""
import argparse
import json
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

EXIT_OK, EXIT_SERVER, EXIT_USO, EXIT_REDE, EXIT_CREDENCIAIS, EXIT_PARCIAL = 0, 1, 2, 3, 4, 5
TIMEOUT = 60
ANTIGO = re.compile(r"^(?P<dir>[^/]+)/(?P<id>[A-Za-z0-9_]+)\.(?P<ext>jpg|png|webp)$")


def falhar(codigo, msg):
    print(f"ERRO: {msg}", file=sys.stderr)
    sys.exit(codigo)


def caminho_de(url, base_publica):
    """Caminho dentro do bucket fotos, ou None se o URL não for deste bucket."""
    u = str(url or "")
    return u[len(base_publica):] if u.startswith(base_publica) else None


def novo_caminho(caminho, token):
    """'2026-11-27/H6RCRL.jpg' → '2026-11-27/H6RCRL-<token>.jpg'; None se não estiver no formato antigo."""
    m = ANTIGO.match(caminho or "")
    return f"{m['dir']}/{m['id']}-{token}.{m['ext']}" if m else None


def ler_chave(caminho):
    try:
        with open(caminho, encoding="utf-8") as f:
            chave = f.readline().strip()
    except OSError as e:
        falhar(EXIT_USO, f"não foi possível ler --key-file: {e}")
    if not chave:
        falhar(EXIT_USO, "--key-file vazio")
    return chave


class Supa:
    def __init__(self, url, chave):
        self.url, self._chave = url.rstrip("/"), chave

    def pedido(self, metodo, caminho, corpo=None, cabecalhos=None):
        h = {"apikey": self._chave, "Authorization": f"Bearer {self._chave}"}
        h.update(cabecalhos or {})
        dados = json.dumps(corpo).encode() if corpo is not None else None
        if dados is not None:
            h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.url + caminho, data=dados, method=metodo, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                t = r.read()
                return r.status, (json.loads(t) if t and t[:1] in (b"[", b"{") else t)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and "/object/public/" not in caminho:
                falhar(EXIT_CREDENCIAIS, f"credenciais recusadas ({e.code})")
            return e.code, e.read(300).decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            falhar(EXIT_REDE, f"sem ligação a {self.url} ({getattr(e, 'reason', e)})")

    def estado_publico(self, caminho):
        req = urllib.request.Request(f"{self.url}/storage/v1/object/public/fotos/{urllib.parse.quote(caminho)}", method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0


def main():
    p = argparse.ArgumentParser(description="Fotos das coleções com nome impossível de adivinhar.")
    p.add_argument("--url", required=True)
    p.add_argument("--key-file", required=True)
    p.add_argument("--aplicar", action="store_true", help="executar (sem isto só mostra o que faria)")
    p.add_argument("--registo", default="migracao_fotos.json")
    a = p.parse_args()
    if not re.match(r"^https://[a-z0-9-]+\.supabase\.co/?$", a.url.strip()):
        falhar(EXIT_USO, "--url deve ser https://<ref>.supabase.co")
    s = Supa(a.url.strip(), ler_chave(a.key_file))
    base = f"{s.url}/storage/v1/object/public/fotos/"

    st, linhas = s.pedido("GET", "/rest/v1/feed_dia?select=dia,ordem,id_curto,imagem_url&imagem_url=not.is.null&order=dia,ordem")
    if st != 200 or not isinstance(linhas, list):
        falhar(EXIT_SERVER, f"ler feed_dia: HTTP {st}")
    plano = []
    for l in linhas:
        c = caminho_de(l["imagem_url"], base)
        n = novo_caminho(c, secrets.token_hex(16)) if c else None
        if n:
            plano.append({"dia": l["dia"], "ordem": l["ordem"], "id_curto": l["id_curto"], "antigo": c, "novo": n})
    print(f"Linhas com foto: {len(linhas)} · a migrar (formato antigo): {len(plano)} · já no formato novo ou de fora: {len(linhas) - len(plano)}")
    for x in plano[:3]:
        print(f"  ex.: {x['antigo']} → {x['novo'][:len(x['novo']) - 20]}…")
    if not a.aplicar:
        print("Simulação: nada foi alterado. Para executar: --aplicar")
        return EXIT_OK

    feitos, falhas = [], []
    for x in plano:
        st, r = s.pedido("POST", "/storage/v1/object/copy", {"bucketId": "fotos", "sourceKey": x["antigo"], "destinationKey": x["novo"]})
        if st != 200 or s.estado_publico(x["novo"]) != 200:
            falhas.append({**x, "passo": "copiar", "erro": str(r)[:120]}); continue
        filtro = f"dia=eq.{x['dia']}&ordem=eq.{x['ordem']}&imagem_url=eq.{urllib.parse.quote(base + x['antigo'], safe='')}"
        st, r = s.pedido("PATCH", f"/rest/v1/feed_dia?{filtro}", {"imagem_url": base + x["novo"]}, {"Prefer": "return=representation"})
        if st != 200 or not isinstance(r, list) or len(r) != 1:
            s.pedido("DELETE", "/storage/v1/object/fotos", {"prefixes": [x["novo"]]})   # desfaz a cópia; a linha fica igual
            falhas.append({**x, "passo": "atualizar", "erro": str(r)[:120]}); continue
        st, r = s.pedido("DELETE", "/storage/v1/object/fotos", {"prefixes": [x["antigo"]]})
        antigo = s.estado_publico(x["antigo"])
        if st != 200 or antigo not in (400, 404):
            falhas.append({**x, "passo": "apagar antigo", "erro": f"HTTP {st}, antigo responde {antigo}"})
        feitos.append(x)
    with open(a.registo, "w", encoding="utf-8") as f:
        json.dump({"feitos": feitos, "falhas": falhas}, f, ensure_ascii=False, indent=1)
    print(f"Migradas: {len(feitos)} · falhas: {len(falhas)} · registo: {a.registo}")
    for f_ in falhas:
        print(f"  FALHA {f_['passo']}: {f_['antigo']} ({f_['erro']})")
    return EXIT_PARCIAL if falhas else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

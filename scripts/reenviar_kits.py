#!/usr/bin/env python3
r"""
Volta a enviar para o bucket privado "kits" (Supabase Storage) os zips já publicados,
mantendo as mesmas chaves (feed_dia.zip_path e verdes.zip_path). Serve quando os kits
são regenerados (ex.: fazer_zip.py v4, kits em inglês, 2026-11-08): a área de membros
continua a apontar para as mesmas chaves e passa a descarregar a versão nova.

Para cada chave "<dia>/<ficheiro>.zip" procura no vault um zip com o mesmo nome
(comparação sem acentos, apóstrofos, sublinhados nem maiúsculas: a chave foi feita
com nome_seguro() a partir de um ficheiro que podia já vir sem acentos), em qualquer
pasta ".../zip/" debaixo de --vault (por omissão só em "Criativos"), e faz upload com
x-upsert: true para a mesma chave. Linhas com feed_dia.retirada = true não são
enviadas; com --desde AAAA-MM-DD, zips mais antigos do que essa data também não. Se houver mais do que um ficheiro com o mesmo
nome, usa o mais recente. Não altera a base de dados.

Só biblioteca padrão (Python 3.9+). Nunca imprime a chave.

Uso:
  python scripts\reenviar_kits.py --url https://<ref>.supabase.co --key-file "<ficheiro com a service role key>" \
      --vault "C:\...\Obsidian Vault\Product Research" [--pasta Criativos] [--dry-run]

Códigos de saída: 0 ok · 1 erro do servidor · 2 argumentos/ficheiros · 3 rede · 4 credenciais · 5 faltam zips.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

EXIT_OK, EXIT_SERVER, EXIT_USO, EXIT_REDE, EXIT_CREDENCIAIS, EXIT_FALTAM = 0, 1, 2, 3, 4, 5
TIMEOUT = 120


def falhar(codigo, msg):
    print(f"ERRO: {msg}", file=sys.stderr)
    sys.exit(codigo)


def nome_seguro(nome):
    """Igual ao publicar_plataforma.py: é assim que a chave do bucket foi construída."""
    base = os.path.basename(nome)
    base = re.sub(r"[^\w.\- ()]+", "_", base, flags=re.UNICODE).strip() or "kit.zip"
    return base[:150]


def normalizar(nome):
    """Chave de comparação tolerante: sem acentos, apóstrofos, sublinhados nem maiúsculas
    ("Sweats à capuche d'automne" e "Sweats a capuche dautomne" são o mesmo kit)."""
    s = unicodedata.normalize("NFKD", os.path.basename(nome))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower().removesuffix(".zip"))


def ler_chave(caminho):
    try:
        with open(caminho, encoding="utf-8") as f:
            chave = f.readline().strip()
    except OSError as e:
        falhar(EXIT_USO, f"não foi possível ler o ficheiro da chave: {e}")
    if len(chave) < 20:
        falhar(EXIT_USO, "ficheiro da chave vazio ou inválido")
    return chave


class Cliente:
    def __init__(self, url, chave, dry_run):
        self.url, self._chave, self.dry_run = url.rstrip("/"), chave, dry_run

    def _pedido(self, metodo, caminho, corpo=None, cabecalhos=None, contexto=""):
        h = {"apikey": self._chave, "Authorization": f"Bearer {self._chave}"}
        h.update(cabecalhos or {})
        req = urllib.request.Request(self.url + caminho, data=corpo, method=metodo, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            detalhe = e.read(300).decode("utf-8", "replace") if e.fp else ""
            if e.code in (401, 403):
                falhar(EXIT_CREDENCIAIS, f"{contexto}: credenciais recusadas ({e.code}). Confirma a service role key e o URL.")
            falhar(EXIT_SERVER, f"{contexto}: HTTP {e.code} {detalhe}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            falhar(EXIT_REDE, f"{contexto}: sem ligação a {self.url} ({getattr(e, 'reason', e)})")

    def chaves(self, tabela):
        """[(zip_path, retirada)] — verdes não tem a coluna retirada."""
        cols = "zip_path,retirada" if tabela == "feed_dia" else "zip_path"
        corpo = self._pedido("GET", f"/rest/v1/{tabela}?select={cols}&zip_path=not.is.null", contexto=f"ler {tabela}")
        return [(r["zip_path"], bool(r.get("retirada"))) for r in json.loads(corpo) if r.get("zip_path")]

    def enviar(self, caminho_local, chave_bucket):
        if self.dry_run:
            return
        with open(caminho_local, "rb") as f:
            dados = f.read()
        self._pedido("POST", "/storage/v1/object/kits/" + urllib.parse.quote(chave_bucket), dados,
                     {"Content-Type": "application/zip", "x-upsert": "true"}, f"upload {chave_bucket}")


def indexar_zips(raiz):
    """normalizar(ficheiro) → caminho do zip mais recente com esse nome, em qualquer pasta 'zip'."""
    idx = {}
    for pasta, _dirs, ficheiros in os.walk(raiz):
        if os.path.basename(pasta).lower() != "zip":
            continue
        for f in ficheiros:
            if not f.lower().endswith(".zip"):
                continue
            caminho = os.path.join(pasta, f)
            k = normalizar(f)
            if k not in idx or os.path.getmtime(caminho) > os.path.getmtime(idx[k]):
                idx[k] = caminho
    return idx


def main():
    p = argparse.ArgumentParser(description="Reenvia os kits (zips) para o bucket 'kits' com as mesmas chaves.")
    p.add_argument("--url", required=True, help="https://<ref>.supabase.co")
    p.add_argument("--key-file", required=True, help="ficheiro com a service role key (1.ª linha), fora do repo e do vault")
    p.add_argument("--vault", required=True, help="raiz do vault (ex.: ...\\Obsidian Vault\\Product Research)")
    p.add_argument("--pasta", default="Criativos", help="subpasta do vault onde procurar (por omissão: Criativos)")
    p.add_argument("--desde", help="só enviar zips modificados a partir desta data (AAAA-MM-DD); os mais antigos ficam listados como 'antigo'")
    p.add_argument("--dry-run", action="store_true", help="não enviar nada; só mostrar o que faria")
    a = p.parse_args()
    desde = None
    if a.desde:
        try:
            desde = dt.datetime.strptime(a.desde, "%Y-%m-%d").timestamp()
        except ValueError:
            falhar(EXIT_USO, "--desde deve ser AAAA-MM-DD")

    if not re.match(r"^https://[a-z0-9-]+\.supabase\.(co|in)/?$", a.url.strip(), re.I):
        falhar(EXIT_USO, "--url deve ser https://<project-ref>.supabase.co")
    raiz = os.path.join(a.vault, a.pasta) if a.pasta else a.vault
    if not os.path.isdir(raiz):
        falhar(EXIT_USO, f"pasta não encontrada: {raiz}")

    cli = Cliente(a.url.strip(), ler_chave(a.key_file), a.dry_run)
    chaves, retiradas = [], set()
    for tabela in ("feed_dia", "verdes"):
        for k, retirada in cli.chaves(tabela):
            if k not in chaves:
                chaves.append(k)
            if retirada:
                retiradas.add(k)
    idx = indexar_zips(raiz)
    print(f"{len(chaves)} chaves no bucket; {len(idx)} zips distintos no vault ({raiz}).")

    enviados, faltam, saltados = [], [], []
    for chave in chaves:
        nome = chave.split("/", 1)[1] if "/" in chave else chave
        local = idx.get(normalizar(nome))
        if chave in retiradas:
            saltados.append(chave)
            print(f"  RETIRADA (não enviado)  {chave}")
            continue
        if not local:
            faltam.append(chave)
            print(f"  FALTA                   {chave}")
            continue
        mtime = os.path.getmtime(local)
        if desde is not None and mtime < desde:
            saltados.append(chave)
            print(f"  ANTIGO (não enviado)    {chave}  ←  {os.path.relpath(local, a.vault)}  ({dt.datetime.fromtimestamp(mtime):%Y-%m-%d %H:%M})")
            continue
        cli.enviar(local, chave)
        enviados.append(chave)
        print(f"  {'[dry-run] ' if a.dry_run else ''}OK                      {chave}  ←  {os.path.relpath(local, a.vault)}  ({os.path.getsize(local)} bytes, {dt.datetime.fromtimestamp(mtime):%Y-%m-%d %H:%M})")

    print(f"\n{'[dry-run] ' if a.dry_run else ''}Substituídos: {len(enviados)}. Saltados (retirada/antigo): {len(saltados)}. Não encontrados no vault: {len(faltam)}.")
    return EXIT_FALTAM if faltam else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

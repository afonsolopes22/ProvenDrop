#!/usr/bin/env python3
r"""
Volta a enviar para o bucket privado "kits" (Supabase Storage) os zips já publicados,
mantendo as mesmas chaves (feed_dia.zip_path e verdes.zip_path). Serve quando os kits
são regenerados (ex.: fazer_zip.py v4, kits em inglês, 2026-11-08): a área de membros
continua a apontar para as mesmas chaves e passa a descarregar a versão nova.

Para cada chave "<dia>/<ficheiro>.zip" procura no vault um zip com o mesmo nome
(depois de nome_seguro(), igual ao publicar_plataforma.py), em qualquer pasta
".../zip/" debaixo de --vault (por omissão só em "Criativos"), e faz upload com
x-upsert: true para a mesma chave. Se houver mais do que um ficheiro com o mesmo
nome, usa o mais recente. Não altera a base de dados.

Só biblioteca padrão (Python 3.9+). Nunca imprime a chave.

Uso:
  python scripts\reenviar_kits.py --url https://<ref>.supabase.co --key-file "<ficheiro com a service role key>" \
      --vault "C:\...\Obsidian Vault\Product Research" [--pasta Criativos] [--dry-run]

Códigos de saída: 0 ok · 1 erro do servidor · 2 argumentos/ficheiros · 3 rede · 4 credenciais · 5 faltam zips.
"""
import argparse
import json
import os
import re
import sys
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
        corpo = self._pedido("GET", f"/rest/v1/{tabela}?select=zip_path&zip_path=not.is.null", contexto=f"ler {tabela}")
        return [r["zip_path"] for r in json.loads(corpo) if r.get("zip_path")]

    def enviar(self, caminho_local, chave_bucket):
        if self.dry_run:
            return
        with open(caminho_local, "rb") as f:
            dados = f.read()
        self._pedido("POST", "/storage/v1/object/kits/" + urllib.parse.quote(chave_bucket), dados,
                     {"Content-Type": "application/zip", "x-upsert": "true"}, f"upload {chave_bucket}")


def indexar_zips(raiz):
    """nome_seguro(ficheiro) → caminho do zip mais recente com esse nome, em qualquer pasta 'zip'."""
    idx = {}
    for pasta, _dirs, ficheiros in os.walk(raiz):
        if os.path.basename(pasta).lower() != "zip":
            continue
        for f in ficheiros:
            if not f.lower().endswith(".zip"):
                continue
            caminho = os.path.join(pasta, f)
            k = nome_seguro(f)
            if k not in idx or os.path.getmtime(caminho) > os.path.getmtime(idx[k]):
                idx[k] = caminho
    return idx


def main():
    p = argparse.ArgumentParser(description="Reenvia os kits (zips) para o bucket 'kits' com as mesmas chaves.")
    p.add_argument("--url", required=True, help="https://<ref>.supabase.co")
    p.add_argument("--key-file", required=True, help="ficheiro com a service role key (1.ª linha), fora do repo e do vault")
    p.add_argument("--vault", required=True, help="raiz do vault (ex.: ...\\Obsidian Vault\\Product Research)")
    p.add_argument("--pasta", default="Criativos", help="subpasta do vault onde procurar (por omissão: Criativos)")
    p.add_argument("--dry-run", action="store_true", help="não enviar nada; só mostrar o que faria")
    a = p.parse_args()

    if not re.match(r"^https://[a-z0-9-]+\.supabase\.(co|in)/?$", a.url.strip(), re.I):
        falhar(EXIT_USO, "--url deve ser https://<project-ref>.supabase.co")
    raiz = os.path.join(a.vault, a.pasta) if a.pasta else a.vault
    if not os.path.isdir(raiz):
        falhar(EXIT_USO, f"pasta não encontrada: {raiz}")

    cli = Cliente(a.url.strip(), ler_chave(a.key_file), a.dry_run)
    chaves = []
    for tabela in ("feed_dia", "verdes"):
        for k in cli.chaves(tabela):
            if k not in chaves:
                chaves.append(k)
    idx = indexar_zips(raiz)
    print(f"{len(chaves)} chaves no bucket a substituir; {len(idx)} zips distintos no vault ({raiz}).")

    enviados, faltam = [], []
    for chave in chaves:
        nome = chave.split("/", 1)[1] if "/" in chave else chave
        local = idx.get(nome_seguro(nome))
        if not local:
            faltam.append(chave)
            print(f"  FALTA   {chave}")
            continue
        cli.enviar(local, chave)
        enviados.append(chave)
        print(f"  {'[dry-run] ' if a.dry_run else ''}OK      {chave}  ←  {os.path.relpath(local, a.vault)}  ({os.path.getsize(local)} bytes)")

    print(f"\nSubstituídos: {len(enviados)}. Não encontrados no vault: {len(faltam)}.")
    return EXIT_FALTAM if faltam else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

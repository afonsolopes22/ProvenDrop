# python scripts/test_migrar_fotos_token.py   (asserts simples; também corre com pytest)
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import migrar_fotos_token as m

BASE = "https://x.supabase.co/storage/v1/object/public/fotos/"
T = "0123456789abcdef0123456789abcdef"


def test_caminho_de_so_o_bucket_fotos():
    assert m.caminho_de(BASE + "2026-11-27/H6RCRL.jpg", BASE) == "2026-11-27/H6RCRL.jpg"
    assert m.caminho_de("https://x.supabase.co/storage/v1/object/public/kits/a.zip", BASE) is None
    assert m.caminho_de(None, BASE) is None


def test_novo_caminho_leva_o_token():
    assert m.novo_caminho("2026-11-27/H6RCRL.jpg", T) == f"2026-11-27/H6RCRL-{T}.jpg"
    assert m.novo_caminho("2026-11-27/o3.png", T) == f"2026-11-27/o3-{T}.png"


def test_novo_caminho_salta_o_que_ja_tem_token_ou_nao_e_foto_de_colecao():
    assert m.novo_caminho(f"2026-11-27/H6RCRL-{T}.jpg", T) is None   # já migrada: não leva segundo token
    assert m.novo_caminho("reel-click/1_shopify.png", T) == f"reel-click/1_shopify-{T}.png"  # (o script só olha para feed_dia)
    assert m.novo_caminho("2026-11-27/sub/H6RCRL.jpg", T) is None
    assert m.novo_caminho("", T) is None


if __name__ == "__main__":
    n = 0
    for nome, f in sorted(globals().items()):
        if nome.startswith("test_"):
            f(); n += 1
    print(f"{n} testes OK")

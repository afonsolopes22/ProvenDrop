// deno test supabase/functions/colecao-foto/regras.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { caminhoDaFoto, idValido, urlMiniatura } from "./regras.ts";

const SB = "https://maljrfgnnhtrjunnwlre.supabase.co";

Deno.test("id_curto: seis caracteres sem 0/O/1/I", () => {
  assertEquals(idValido("H6RCRL"), true);
  assertEquals(idValido(" h6rcrl "), true);
  assertEquals(idValido("ABC"), false);
  assertEquals(idValido("H6RCR0"), false);
  assertEquals(idValido("../x"), false);
  assertEquals(idValido(null), false);
});

Deno.test("só fotos do bucket público fotos deste projeto", () => {
  assertEquals(caminhoDaFoto(`${SB}/storage/v1/object/public/fotos/2026-11-27/H6RCRL.jpg`, SB), "2026-11-27/H6RCRL.jpg");
  // 2026-11-28: nome com token aleatório (publicar_plataforma.py e scripts/migrar_fotos_token.py)
  assertEquals(caminhoDaFoto(`${SB}/storage/v1/object/public/fotos/2026-11-27/H6RCRL-0123456789abcdef0123456789abcdef.jpg`, SB), "2026-11-27/H6RCRL-0123456789abcdef0123456789abcdef.jpg");
  assertEquals(caminhoDaFoto(`${SB}/storage/v1/object/public/kits/2026-11-27/H6RCRL.zip`, SB), null);
  assertEquals(caminhoDaFoto("https://evil.example.com/storage/v1/object/public/fotos/x.jpg", SB), null);
  assertEquals(caminhoDaFoto(`${SB}/storage/v1/object/public/fotos/../kits/x.zip`, SB), null);
  assertEquals(caminhoDaFoto(`${SB}/storage/v1/object/public/fotos/a b.jpg`, SB), null);
  assertEquals(caminhoDaFoto(null, SB), null);
});

Deno.test("miniatura: 32×24, do lado do servidor", () => {
  assertEquals(urlMiniatura(SB + "/", "2026-11-27/H6RCRL.jpg"), `${SB}/storage/v1/render/image/public/fotos/2026-11-27/H6RCRL.jpg?width=32&height=24&resize=cover&quality=40`);
});

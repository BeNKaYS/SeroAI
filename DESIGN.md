---
name: SeroAI
description: Ajan becerileri, kuralları ve MCP bağlantıları için onay ve yedek odaklı yerel yönetim paneli.
colors:
  accent: "#2f4bd8"
  accent-dark: "#93a4ff"
  ground: "#f5f3ee"
  rail: "#efede6"
  surface: "#ffffff"
  surface-dark: "#1d2125"
  ink: "#1c1f24"
  ink-dark: "#ecebe5"
  muted: "#575e66"
  line: "#d9d5cb"
  ok: "#1f7a52"
  warn: "#8a5200"
  danger: "#a7261f"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  screen-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.6rem, 1.4rem + 0.7vw, 1.95rem)"
    fontWeight: 660
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  panel-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  sm: "9px"
  md: "14px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
    typography: "{typography.body}"
  button-primary-dark:
    backgroundColor: "{colors.accent-dark}"
    textColor: "#10131a"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
  ledger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px 22px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "42px"
---

# SeroAI tasarım sistemi

## Overview

Panel bir Operate yüzeyidir: kullanıcı bir işi bitirmeye gelir, tasarım işi yavaşlatmaz. Dünya yalnızca dört katkıyla girer: tipografi, palet, yoğunluk ve tek imza hareketi. Navigasyon ve kontroller tanıdık web bileşenleridir.

İmza hareketi **değişiklik defteri**dir: her yazma, dikey zaman çizgisinde dosya, eylem ve hash ile görünür; onay düğmesi defterin sonundadır. Panelin geri kalanı sakin, cömert boşluklu ve tek birincil aksiyonludur.

## Colors

Sıcak nötr zemin ve beyaz yüzeyler; tek vurgu çivit (`#2f4bd8`, koyu modda `#93a4ff`). Durum renkleri yalnızca anlam taşıdığında kullanılır: yeşil uygulandı, amber bekliyor/incelenmedi, kırmızı hata. Koyu mod ayrı birinci sınıf bir palettir; aynı rollerin tonları değişir, düzen değişmez.

## Typography

Sistem fontu; gövde 16 px, ekran başlığı 26–31 px, panel başlığı ~17 px. Monospace yalnızca hash, yol ve onay kimliği içindir; süs olarak kullanılmaz. Başlıklarda negatif izleme -0.025em'i geçmez.

## Layout

Masaüstünde 232 px sol ray + en çok 1000 px içerik; 900 px altında ray yatay üst navigasyona dönüşür. Dış boşluk 40 px, kart içi 22 px, satır yüksekliği en az 44 px. Formlar iki sütun, dar ekranda tek sütun.

## Elevation & Depth

Tek yükseklik dili: yumuşak, dağınık gölge (`0 10px 30px -18px` açık, `0 12px 34px -20px` koyu). Kartlarda çizgi yerine ton farkı ve boşluk; tablo satırlarında yalnızca ince ayırıcı çizgi.

## Shapes

Kart 14 px, düğme/input 9 px, rozet 999 px. Keskin köşe yok; iç içe kart yok.

## Components

- **Birincil düğme:** dolu çivit, 44 px, tek birincil aksiyon.
- **İkincil düğme:** şeffaf zemin, ince çizgi; hover'da yüzey tonu.
- **Değişiklik defteri:** yüzey kartı; zaman çizgisi, eylem etiketi, dosya yolu, hash/kayıt detayı ve onay düğmesi.
- **Durum satırı:** etiket + değer; kayıt durumu rozetle.
- **Tablo:** `caption` ile erişilebilir; başlıklar sakin, sayılar tabular.
- **Bildirim:** alt kenarda yapışkan, `role="status"`, tonlu zemin.

## Do's and Don'ts

- **Do** her ekranda tek birincil aksiyon bırak.
- **Do** yazmadan önce değişiklik defterini göster; onay kimliğini görünür tut.
- **Do** durum renklerini yalnızca anlam taşıdığında kullan.
- **Do** odak halkasını, seçim rengini ve kaydırma çubuğunu paletten türet.
- **Don't** eyebrow/kicker etiket, gradient metin, süs camı veya emoji ikon kullanma.
- **Don't** her bölüme aynı giriş animasyonunu koyma; tek, kısa ve `prefers-reduced-motion`'a saygılı kal.
- **Don't** ham config, token veya kullanıcı sohbetini panelde gösterme.

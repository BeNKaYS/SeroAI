import { warnings } from '../core/plan.mjs';

export const messages = {
  tr: {
    help: `SeroAI — salt okunur geliştirme sürümü (doğrulama bekliyor)

Komutlar:
  help                               Yardımı göster
  version                            version.json içindeki sürümü göster
  catalog [--json]                    Kaynakları ve hedef uygulamaları listele
  setup --client <id> --package <id>  Yalnızca kurulum önizlemesi üret

--client ve --package birden fazla kullanılabilir.
--lang tr|en ile dil, catalog/setup için --json ile JSON çıktısı seçilir.
setup hiçbir değişiklik uygulamaz, ayar okumaz ve kurulum yapmaz.
update, backup, restore, uninstall ve status henüz uygulanmadı.`,
    packages: 'Kaynaklar (sürüm ve lisans incelemesi bekliyor)',
    clients: 'Hedef uygulamalar (destek doğrulanmadı)',
    preview: 'ÖNİZLEME — Hiçbir değişiklik uygulanmadı. Kurulum yapılmadı.',
    reviewRequired: 'inceleme gerekiyor',
    unverified: 'doğrulanmadı',
    warning: 'Uyarı',
    error: 'Hata',
    warningTexts: [
      'Uygulama yetenekleri doğrulanmadı; bu önizleme uyumluluk kanıtı değildir.',
      'MCP, otomatik oturum kaydı veya yerel hook desteği anlamına gelmez.',
      'Kaynak sürümleri ve lisanslar incelenmedi; hiçbir şey indirilmeyecek veya kurulmayacak.',
    ],
    errors: {
      INVALID_ARGUMENTS: 'Geçersiz komut, bayrak veya bayrak değeri. Kullanım için help komutuna bakın.',
      INVALID_SELECTION: 'En az bir uygulama ve bir paket açıkça seçilmelidir.',
      UNKNOWN_PACKAGE: 'Bilinmeyen paket kimliği. Seçenekler için catalog komutuna bakın.',
      UNKNOWN_CLIENT: 'Bilinmeyen uygulama kimliği. Seçenekler için catalog komutuna bakın.',
      NOT_IMPLEMENTED: 'Bu komut henüz uygulanmadı. Yalnızca salt okunur önizleme kullanılabilir.',
      INVALID_CATALOG: 'Katalog veya sürüm dosyaları eksik ya da geçersiz.',
      INTERNAL_ERROR: 'İşlem tamamlanamadı. Hiçbir kurulum işlemi başlatılmadı.',
    },
  },
  en: {
    help: `SeroAI — read-only development build (verification pending)

Commands:
  help                               Show help
  version                            Show the version from version.json
  catalog [--json]                    List sources and target clients
  setup --client <id> --package <id>  Generate a setup preview only

Repeat --client and --package to select multiple IDs.
Use --lang tr|en for language; catalog/setup support --json.
setup applies no changes, reads no client settings and installs nothing.
update, backup, restore, uninstall and status are not implemented.`,
    packages: 'Sources (version and license review pending)',
    clients: 'Target clients (capabilities unverified)',
    preview: 'PREVIEW — No changes applied. Nothing installed.',
    reviewRequired: 'review-required',
    unverified: 'unverified',
    warning: 'Warning',
    error: 'Error',
    warningTexts: warnings,
    errors: {
      INVALID_ARGUMENTS: 'Invalid command, flag or flag value. See help for usage.',
      INVALID_SELECTION: 'Select at least one client and one package explicitly.',
      UNKNOWN_PACKAGE: 'Unknown package ID. See catalog for available IDs.',
      UNKNOWN_CLIENT: 'Unknown client ID. See catalog for available IDs.',
      NOT_IMPLEMENTED: 'This command is not implemented yet. Only read-only preview is available.',
      INVALID_CATALOG: 'Catalog or version files are missing or invalid.',
      INTERNAL_ERROR: 'The operation could not finish. No installation was started.',
    },
  },
};

export function localizePlan(plan, language) {
  const translation = messages[language];
  return {
    ...plan,
    warnings: plan.warnings.map(warning => translation.warningTexts[warnings.indexOf(warning)] ?? warning),
  };
}

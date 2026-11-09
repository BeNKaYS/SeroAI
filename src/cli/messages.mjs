import { warnings } from '../core/plan.mjs';
import { inspectionWarnings } from '../core/inspection.mjs';
import { openCodeWarnings } from '../adapters/opencode.mjs';

export const messages = {
  tr: {
    help: `SeroAI — deneysel geliştirme sürümü

Komutlar:
  help                               Yardımı göster
  version                            version.json içindeki sürümü göster
  catalog [--json]                    Kaynakları ve hedef uygulamaları listele
  setup --client <id> --package <id>  Yalnızca kurulum önizlemesi üret
  inspect --workspace <mutlak-yol>    Yönetilen klasörü salt okunur incele
  recover --workspace <mutlak-yol>    Kurtarma önizlemesi göster
  opencode-preview                   OpenCode V2 ayar parçası önizlemesi
  opencode-project --project <yol>    Git projesi için onaylı ayar planı
  opencode-rollback --project <yol>   Son proje işlemini geri alma planı
  update --root <yol> --local <klasör>        Yerel klasörden güncelleme önizlemesi
  update --root <yol> --repo <sahip/ad> [--ref <dal>]
                                               GitHub sürümünden güncelleme önizlemesi
  update-rollback --root <yol>        Son güncellemeyi geri alma önizlemesi
  profile-export --client <id> --package <id> [--name <ad>]
                 [--source <anahtar:skill|instruction>] [--github]
                                               Taşınabilir profil JSON'u üret
  profile-restore --profile <dosya> --project <yol> --map <anahtar=/mutlak/yol>
                                               Profili OpenCode projesine geri yükle
  ui [--root <yol>] [--port <0-65535>] [--no-open]
                                               Yerel paneli başlat
  install --project <yol> [--profile core | --package <id>...]
  install --global [--profile core | --package <id>...]
                                               Pinlenmiş becerileri kur (önizleme)
  install-doctor --project <yol> | --global   Kurulum durumunu denetle
  install-rollback --project <yol> | --global Son kurulumu geri alma önizlemesi
  uninstall --project <yol> | --global [--package <id>...]
                                               Kurulu becerileri kaldır

--client ve --package birden fazla kullanılabilir.
--lang tr|en ile dil, catalog/setup/inspect/recover/opencode-preview için --json seçilir.
opencode-preview için --skill-dir <mutlak-yol>, --instruction <mutlak-md-yolu>
ve/veya --github seçin. Yol bayrakları tekrar kullanılabilir; ayarlara yazılmaz.
opencode-project aynı kaynak bayraklarını kullanır; --project mutlak bir Git
projesi olmalıdır. Proje komutları varsayılan olarak önizlemedir; yalnızca
--approve <güncel-id> ile ayara yazılır veya ayar geri alınır. Yedekler .git/seroai içindedir.
update yalnızca yerel klasör veya GitHub release/ref kaynağını okur; --repo ve --local
birlikte kullanılmaz. Onaydan sonra önce yedek alınır, sonra indirilen açık dosyalar
doğrulanarak yazılır. Güncelleme üçüncü taraf paketleri kurmaz; bağımlılık kurulmaz.
profile-export stdout'a JSON yazar ve hiçbir dosya oluşturmaz. profile-restore yalnızca
açık --map eşlemeleriyle çalışır; OpenCode dışındaki istemciler ertelenmiş sayılır.
ui yalnızca 127.0.0.1'e bağlanır ve adres oturum belirteci içerir; belirteci paylaşmayın.
Panel dış ağa istek atmaz. Durdurmak için Ctrl+C kullanın. --no-open tarayıcıyı açmaz.
install yalnızca lisansı ve dosya yapısı uygun paketleri pinlenmiş GitHub commit'inden
indirir; onaydan önce hiçbir dosya yazmaz. --global yalnızca açıkça verilirse kullanılır.
MCP, hook, plugin ve diğer istemciler bu komutla kurulmaz.
setup hiçbir değişiklik uygulamaz, ayar okumaz ve kurulum yapmaz.
recover varsayılan olarak salt okunurdur. Yalnızca aynı önizlemenin kimliğiyle
--approve <id> verilirse dosyalar geri alınır; işlem dosya silebilir.
backup, restore ve status henüz uygulanmadı.`,
    packages: 'Kaynaklar (sürüm ve lisans incelemesi bekliyor)',
    clients: 'Hedef uygulamalar (destek doğrulanmadı)',
    preview: 'ÖNİZLEME — Hiçbir değişiklik uygulanmadı. Kurulum yapılmadı.',
    reviewRequired: 'inceleme gerekiyor',
    unverified: 'doğrulanmadı',
    warning: 'Uyarı',
    error: 'Hata',
    inspection: 'İNCELEME — Hiçbir değişiklik uygulanmadı.',
    openCodePreview: 'OPENCODE V2 ÖNİZLEMESİ — Ayar parçası; hiçbir değişiklik uygulanmadı. Uygulamaya hazır değildir.',
    projectPreview: 'PROJE AYARI ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı.',
    projectRollbackPreview: 'PROJE GERİ ALMA ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı; oluşturulan config silinebilir.',
    projectApplied: 'Proje ayarı yedek alınarak uygulandı. Canlı OpenCode bağlantısı doğrulanmadı; GitHub MCP kapalı kalır.',
    projectRolledBack: 'Proje ayarı işlem öncesine döndürüldü; yedek korundu.',
    projectNoChanges: 'Seçilen kayıtlar zaten mevcut; config yeniden yazılmadı.',
    noProjectRollback: 'Geri alınacak kayıtlı proje işlemi yok; hiçbir değişiklik uygulanmadı.',
    projectWarnings: [
      'Yalnızca açıkça seçilen Git projesinin ayarı yönetilir. Üst dizin, global veya sistem ayarları sonucu değiştirebilir.',
      'Kaynakların yerel dosya bütünlüğü kontrol edilir; upstream sürüm, lisans, skill kalitesi ve canlı uyumluluk doğrulanmaz.',
      'Onaylı işlem config dosyasını değiştirir. Geri alma işlem dosyasını silebilir; kullanıcı düzenlemesi saptanırsa durur.',
    ],
    openCodeWarningTexts: [
      'Bu bir ayar parçasıdır, mevcut JSON/JSONC dosyasının yerine geçmez; çakışmalar ve yüksek öncelikli ayarlar ayrıca incelenmelidir.',
      'Yerel yollar, kaynak sürümleri ve lisanslar doğrulanmadı; dosya okunmaz veya kurulum yapılmaz.',
      'Kurulu OpenCode/OpenChamber sürümü ve canlı uyumluluk doğrulanmadı; bu önizleme OpenCode V2 belgelerini hedefler.',
      'GitHub MCP kapalı kalır; kimlik doğrulama ve erişim doğrulanmadı. Bağlantı denenmez.',
    ],
    recoveryPreview: 'KURTARMA ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı.',
    noRecovery: 'Bekleyen kurtarma günlüğü yok; hiçbir değişiklik uygulanmadı. Bu sonuç kurulumun sağlıklı olduğunu kanıtlamaz.',
    recoveryComplete: 'Kurtarma tamamlandı; ilgili dosyalar işlem öncesine döndürüldü. Yedekler korundu.',
    recoveryApproval: 'Listelenen değişiklikleri onaylıyorsanız aynı recover komutuna şu seçeneği ekleyin:',
    recoveryActions: { delete: 'işlemin oluşturduğu dosyayı sil', restore: 'yedekteki önceki içeriği geri yükle', leave: 'zaten önceki durumda; değiştirme' },
    recoveryWarnings: [
      'Onaylı kurtarma yalnızca listelenen işlem hedeflerini etkiler; oluşturulan dosyalar silinebilir.',
      'Gerçek ajan kurulumu yapılmaz. Bozuk kayıt, kullanıcı değişikliği veya mevcut kilit işlemi engeller.',
    ],
    ownershipRecord: 'Sahiplik kaydı',
    recordStates: { present: 'var', missing: 'eksik; kurulum durumu bilinmiyor' },
    fileStates: { unchanged: 'değişmemiş', modified: 'değiştirilmiş', missing: 'eksik', unsafe: 'güvensiz; okunmadı' },
    updatePreview: 'GÜNCELLEME ÖNİZLEMESİ — Hiçbir dosya yazılmadı; yedek alınmadı.',
    updateCurrent: 'Mevcut sürüm',
    updateCandidate: 'Kaynak sürüm',
    updateSource: 'Kaynak',
    updateApplied: 'Güncelleme yedek alınarak uygulandı. Yeni sürüm:',
    updateNone: 'Güncelleme yok; kaynak sürümü mevcut sürümden yeni değil. Hiçbir dosya yazılmadı.',
    updateRollbackPreview: 'GÜNCELLEME GERİ ALMA ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı.',
    updateInterrupted: 'Yarım kalmış bir yazım saptandı; geri alma bu işlemi tamamlar.',
    updateRolledBack: 'Güncelleme işlem öncesine döndürüldü; yedek korundu. CLI elle yeniden başlatılmalıdır.',
    noUpdateRollback: 'Geri alınacak kayıtlı güncelleme yok; hiçbir değişiklik uygulanmadı.',
    updateWarnings: [
      'Program güncellemesi üçüncü taraf beceri paketlerini kurmaz veya güncellemez.',
      'Yalnızca manifestte listelenen açık dosyalar yazılır; bağımlılıklar otomatik kurulmaz, CLI elle yeniden başlatılır.',
      'SHA-256 bütünlük sağlar; yayıncı kimliği veya imzalı sürüm garantisi değildir. Özel repo ve token desteklenmez.',
    ],
    profileDefaultName: 'SeroAI profili',
    profilePreview: 'PROFİL GERİ YÜKLEME ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı.',
    profileApplied: 'Profil yedek alınarak OpenCode projesine uygulandı; diğer istemciler ertelendi.',
    profileNothingApplied: 'Seçili istemciler için uygulanabilir uyarlama yok; hiçbir değişiklik uygulanmadı.',
    profileDeferredClient: 'istemcisi bu sürümde uygulanmadı; elle yapılandırılmalıdır.',
    uiStarted: 'SeroAI paneli hazır. Adres oturum belirteci içerir; paylaşmayın. Tarayıcıda açın:',
    uiStopHint: 'Durdurmak için Ctrl+C.',
    installPreview: 'KURULUM ÖNİZLEMESİ — Hiçbir dosya yazılmadı; içerik indirilmedi.',
    installTargets: { project: 'Proje hedefi', global: 'Global hedef' },
    installApplied: 'Kurulum onaylandı; dosyalar doğrulandı ve sahiplik kaydı yazıldı.',
    installUnchanged: 'Seçilen beceriler zaten kurulu ve değişmemiş; dosya yazılmadı.',
    installRollbackPreview: 'KURULUM GERİ ALMA ÖNİZLEMESİ — Hiçbir değişiklik uygulanmadı.',
    installRolledBack: 'Son kurulum geri alındı; önceki sahiplik durumu geri getirildi.',
    noInstallRollback: 'Geri alınacak kayıtlı kurulum yok; hiçbir değişiklik uygulanmadı.',
    installInterrupted: 'Yarım kalmış bir kurulum saptandı; geri alma bu işlemi tamamlar.',
    installDoctor: 'KURULUM DURUMU — Hiçbir dosya değiştirilmedi.',
    installDoctorEmpty: 'Bu hedefte SeroAI kurulum kaydı yok.',
    installStates: { unchanged: 'değişmemiş', modified: 'değiştirilmiş', missing: 'eksik', unsafe: 'güvensiz' },
    uninstallPreview: 'KALDIRMA ÖNİZLEMESİ — Hiçbir dosya silinmedi.',
    uninstallApplied: 'Seçilen beceriler kaldırıldı; kullanıcı dosyaları korundu.',
    noUninstall: 'Kaldırılacak kayıtlı beceri yok; hiçbir değişiklik uygulanmadı.',
    uninstallAction: 'sahipli dosyalar silinecek',
    installNoLicense: 'lisans yok',
    installReasons: {
      'license-missing': 'lisans belirtilmemiş; otomatik kurulmaz',
      'upstream-cli': 'upstream CLI/araç; dosya kurulumu yok',
      'config-only': 'ayar kaydı; opencode-project --github kullanın',
    },
    installWarnings: [
      'Kaynaklar GitHub üzerindeki pinlenmiş commitlerden indirilir; upstream davranışı veya kalitesi doğrulanmaz.',
      'Yalnızca beceri dosyaları kurulur; MCP, hook, plugin, komut ve diğer istemciler değişmez.',
      'Kurulan dosyalar OpenCode keşif klasörüne yazılır; sonradan yapılan kullanıcı düzenlemeleri ezilmez.',
    ],
    inspectionWarningTexts: [
      'İnceleme yalnızca sahiplik kaydını mevcut dosyalarla karşılaştırır; yarıda kalan işlemler ve yedekler doğrulanmaz. Kurtarma yapılmaz.',
      'Sahiplik kaydı eksik; bu, kurulumun boş veya sağlıklı olduğunu kanıtlamaz.',
    ],
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
      NOT_IMPLEMENTED: 'Bu komut henüz uygulanmadı. Kullanılabilir komutlar için help komutuna bakın.',
      INVALID_CATALOG: 'Katalog veya sürüm dosyaları eksik ya da geçersiz.',
      INTERNAL_ERROR: 'İşlem tamamlanamadı. Hiçbir kurulum işlemi başlatılmadı.',
      INVALID_WORKSPACE: 'Çalışma klasörü için güvenli, özel ve var olan bir mutlak yol gereklidir.',
      INVALID_WORKSPACE_RECORD: 'Çalışma klasörünün sahiplik kaydı geçersiz veya güvenli biçimde okunamıyor.',
      INSPECTION_FAILED: 'Çalışma klasörü incelemesi tamamlanamadı; hiçbir değişiklik uygulanmadı.',
      APPROVAL_REQUIRED: 'Önizlemenin güncel kimliğiyle açık onay gerekiyor. Önizlemeyi yeniden alın.',
      STALE_PLAN: 'Önizleme artık güncel değil veya bekleyen işlem kalmadı. Önizlemeyi yeniden alın.',
      INVALID_PLAN: 'Geçersiz veya daha önce kullanılmış kurtarma planı.',
      INVALID_JOURNAL: 'Kurtarma günlüğü veya yedeği geçersiz; kurtarma başlatılmadı.',
      CONFLICT: 'Dosya durumu işlem kaydıyla eşleşmiyor; kullanıcı değişikliği korunarak işlem durduruldu.',
      UNSAFE_FILE: 'Güvensiz dosya veya bağlantı saptandı; işlem başlatılmadı.',
      WORKSPACE_BUSY: 'Yazıcı süreç hâlâ çalışıyor veya kurtarma kilidi mevcut. Kilit otomatik kaldırılmaz.',
      RECOVERY_REQUIRED: 'Kurtarma tamamlanamadı. Günlük ve yedekler korunarak işlem durduruldu; elle inceleme gerekebilir.',
      INVALID_ADAPTER_OPTIONS: 'En az bir geçerli mutlak beceri klasörü, .md talimat dosyası veya GitHub seçimi gerekiyor. Uzak yol, glob ve yol kaçışı kabul edilmez.',
      UNSUPPORTED_CLIENT_VERSION: 'Bu uyarlama yalnızca OpenCode V2 belgelerini hedefler; başka sürümler doğrulanmadı.',
      INVALID_PROJECT: 'Mutlak yol ve gerçek .git dizini bulunan güvenli bir proje gerekiyor. Worktree bağlantıları ve Git dışı klasörler bu sürümde manuel kalır.',
      INVALID_PROJECT_CONFIG: 'Proje config dosyası güvenli ve benzersiz anahtarları olan geçerli JSON/JSONC olarak işlenemedi.',
      CONFIG_CONFLICT: 'Mevcut ayarla, V1 şekliyle veya yüksek öncelikli başka config dosyasıyla çakışma var; üzerine yazılmadı.',
      INVALID_SOURCE: 'Seçilen yerel kaynak bulunamadı, boş veya güvenli dosya/sayı/boyut sınırları dışında.',
      INVALID_PROJECT_STATE: 'Özel proje durumu veya yedeği güvenli biçimde doğrulanamadı; elle inceleme gerekiyor.',
      PROJECT_APPLY_FAILED: 'Proje ayarı uygulanamadı; işlem öncesi dosya korundu veya geri getirildi.',
      BACKUP_FAILED: 'Yedek ve işlem kaydı tamamlanamadı; hedef ayara yazılmadı.',
      UNSAFE_PATH: 'Güvensiz veya sembolik bağlantı içeren yol reddedildi.',
      INVALID_UPDATE_SOURCE: 'Güncelleme kaynağı geçersiz. Yalnızca HTTPS GitHub adresleri ve yerel klasör kabul edilir; token ve özel repo desteklenmez.',
      UPDATE_SOURCE_UNAVAILABLE: 'Güncelleme kaynağına ulaşılamadı veya beklenen dosyalar bulunamadı. Hiçbir dosya yazılmadı.',
      INVALID_UPDATE_MANIFEST: 'Güncelleme manifesti, sürüm dosyası veya sürüm numarası geçersiz. Hiçbir dosya yazılmadı.',
      UPDATE_INTEGRITY_FAILED: 'İndirilen içerik boyut veya SHA-256 doğrulamasını geçemedi; hiçbir dosya yazılmadı.',
      INVALID_UPDATE_TARGET: 'Güncelleme hedefi güvenli bir SeroAI kurulumu değil veya boyut sınırını aşıyor.',
      UNOWNED_UPDATE_FILE: 'Hedefte SeroAI’a ait olmayan bir dosya var; üzerine yazılmadı.',
      UPDATE_APPLY_FAILED: 'Güncelleme uygulanamadı; işlem öncesi dosyalar geri getirildi ve yedek korundu.',
      INVALID_UPDATE_STATE: 'Güncelleme durumu veya yedeği güvenli biçimde doğrulanamadı; elle inceleme gerekiyor.',
      INVALID_PROFILE: 'Profil dosyası geçersiz: bilinmeyen alan, yol, sır veya katalog dışı seçim içeriyor.',
      INVALID_PROFILE_SOURCE: 'Profil kaynağı geçersiz. Anahtar küçük harfli olmalı ve skill veya instruction türü seçilmelidir.',
      INVALID_PROFILE_MAPPING: 'Eşleme geçersiz: her profil kaynağı için mutlak bir yol gerekir; eksik, fazla veya göreli yol kabul edilmez.',
      UI_NOT_FOUND: 'Arayüz uç noktası bulunamadı.',
      UI_UNAUTHORIZED: 'Oturum belirteci eksik veya geçersiz. Paneli yeniden başlatın.',
      UI_FORBIDDEN: 'İstek kaynağı bu panele ait değil; işlem yapılmadı.',
      UI_UNSUPPORTED_MEDIA: 'Yalnızca application/json gövdesi kabul edilir.',
      UI_PAYLOAD_TOO_LARGE: 'İstek gövdesi 256 KiB sınırını aşıyor.',
      UI_METHOD_NOT_ALLOWED: 'Bu yöntem desteklenmiyor.',
      UI_INVALID_REQUEST: 'İstek gövdesi geçersiz JSON veya bilinmeyen alan içeriyor.',
      INVALID_INSTALL_SOURCE: 'Kurulum kaynağı geçersiz: pin, lisans veya depo alanı doğrulanamadı.',
      INSTALL_SOURCE_UNAVAILABLE: 'Kurulum kaynağına ulaşılamadı veya beklenen dosyalar bulunamadı; hiçbir dosya yazılmadı.',
      INVALID_ARCHIVE: 'İndirilen arşiv güvenli biçimde açılamadı; hiçbir dosya yazılmadı.',
      INVALID_INSTALL_STATE: 'Kurulum durumu veya sahiplik kaydı güvenli biçimde doğrulanamadı.',
      INVALID_INSTALL_TARGET: 'Kurulum hedefi güvenli bir istemci klasörü değil. Global kurulumda önce OpenCode yapılandırma klasörü bulunmalıdır.',
      INSTALL_INTEGRITY_FAILED: 'İndirilen dosya içeriği ağaç kaydıyla eşleşmedi; hiçbir dosya yazılmadı.',
      INSTALL_APPLY_FAILED: 'Kurulum uygulanamadı; işlem öncesi durum geri getirildi.',
      DUPLICATE_SKILL: 'Aynı beceri adı iki pakette geçiyor; çakışma nedeniyle işlem durduruldu.',
      INSTALL_NOT_ALLOWED: 'Bu paket otomatik kuruluma uygun değil: lisans, tür veya dosya yapısı sınırı.',
    },
  },
  en: {
    help: `SeroAI — experimental development build

Commands:
  help                               Show help
  version                            Show the version from version.json
  catalog [--json]                    List sources and target clients
  setup --client <id> --package <id>  Generate a setup preview only
  inspect --workspace <absolute-path> Inspect a managed workspace read-only
  recover --workspace <absolute-path> Show a recovery preview
  opencode-preview                   Preview an OpenCode V2 config fragment
  opencode-project --project <path>  Plan project settings with explicit approval
  opencode-rollback --project <path> Preview restoring the last project transaction
  update --root <path> --local <dir>          Preview an update from a local folder
  update --root <path> --repo <owner/name> [--ref <branch>]
                                               Preview an update from a GitHub release
  update-rollback --root <path>      Preview rolling back the last update
  profile-export --client <id> --package <id> [--name <name>]
                 [--source <key:skill|instruction>] [--github]
                                               Emit a portable profile JSON
  profile-restore --profile <file> --project <path> --map <key=/absolute/path>
                                               Restore a profile into an OpenCode project
  ui [--root <path>] [--port <0-65535>] [--no-open]
                                               Start the local panel
  install --project <path> [--profile core | --package <id>...]
  install --global [--profile core | --package <id>...]
                                               Install pinned skills (preview)
  install-doctor --project <path> | --global  Report install state
  install-rollback --project <path> | --global Preview rolling back the last install
  uninstall --project <path> | --global [--package <id>...]
                                               Remove installed skills

Repeat --client and --package to select multiple IDs.
Use --lang tr|en for language; catalog/setup/inspect/recover/opencode-preview support --json.
For opencode-preview select --skill-dir <absolute-path>, --instruction <absolute-md-path>
and/or --github. Path flags can repeat; no configuration is written.
opencode-project accepts the same source flags and an absolute Git project.
Project commands preview by default; only --approve <current-id> authorizes
configuration writes or rollback. Backups stay under .git/seroai.
update reads only a local folder or a GitHub release/ref; --repo and --local are exclusive.
After approval it writes a backup first, then downloads and verifies the listed files.
It installs no third-party packages or dependencies and never executes downloaded code.
profile-export prints JSON to stdout and creates no files. profile-restore only uses explicit
--map entries; clients other than OpenCode are reported as deferred.
ui listens on 127.0.0.1 only and its address carries a session token; do not share it.
The panel makes no outbound requests. Use Ctrl+C to stop. --no-open skips the browser.
install downloads only licensed, structurally valid packages from pinned GitHub commits;
it writes nothing before approval. --global is used only when given explicitly.
MCP, hooks, plugins and other clients are not installed by this command.
setup applies no changes, reads no client settings and installs nothing.
recover is read-only by default. Only --approve <id> matching the current
preview authorizes recovery writes; the operation may delete files.
backup, restore and status are not implemented.`,
    packages: 'Sources (version and license review pending)',
    clients: 'Target clients (capabilities unverified)',
    preview: 'PREVIEW — No changes applied. Nothing installed.',
    reviewRequired: 'review-required',
    unverified: 'unverified',
    warning: 'Warning',
    error: 'Error',
    inspection: 'INSPECTION — No changes applied.',
    openCodePreview: 'OPENCODE V2 PREVIEW — Configuration fragment only; no changes applied. Not ready to apply.',
    projectPreview: 'PROJECT CONFIG PREVIEW — No changes applied.',
    projectRollbackPreview: 'PROJECT ROLLBACK PREVIEW — No changes applied; a transaction-created config may be deleted.',
    projectApplied: 'Project settings applied with a backup. Live OpenCode connectivity remains unverified; GitHub MCP stays disabled.',
    projectRolledBack: 'Project settings returned to their previous state; backup retained.',
    projectNoChanges: 'Selected entries already exist; configuration was not rewritten.',
    noProjectRollback: 'No recorded project transaction to roll back; no changes applied.',
    projectWarnings: [
      'Only the explicitly selected Git project is managed. Ancestor, global or system settings may override the result.',
      'Local source integrity is checked; upstream version, license, skill quality and live compatibility remain unverified.',
      'Approval changes the config file. Rollback may delete a transaction-created config; user modifications block rollback.',
    ],
    openCodeWarningTexts: openCodeWarnings,
    recoveryPreview: 'RECOVERY PREVIEW — No changes applied.',
    noRecovery: 'No pending recovery journal; no changes applied. This does not prove a healthy installation.',
    recoveryComplete: 'Recovery completed; transaction targets returned to their previous state. Backups retained.',
    recoveryApproval: 'If you approve the listed changes, add this option to the same recover command:',
    recoveryActions: { delete: 'delete the file created by the transaction', restore: 'restore the previous backed-up content', leave: 'already in the previous state; leave unchanged' },
    recoveryWarnings: [
      'Approved recovery affects only the listed transaction targets; newly created files may be deleted.',
      'No agent is installed. Invalid records, user modifications or an existing lock block recovery.',
    ],
    ownershipRecord: 'Ownership record',
    recordStates: { present: 'present', missing: 'missing; installation state unknown' },
    fileStates: { unchanged: 'unchanged', modified: 'modified', missing: 'missing', unsafe: 'unsafe; not read' },
    updatePreview: 'UPDATE PREVIEW — No files written; no backup taken.',
    updateCurrent: 'Current version',
    updateCandidate: 'Source version',
    updateSource: 'Source',
    updateApplied: 'Update applied with a backup. New version:',
    updateNone: 'No update; the source version is not newer than the current version. No files written.',
    updateRollbackPreview: 'UPDATE ROLLBACK PREVIEW — No changes applied.',
    updateInterrupted: 'An interrupted write was found; rollback completes that transaction.',
    updateRolledBack: 'Update returned to its previous state; backup retained. Restart the CLI manually.',
    noUpdateRollback: 'No recorded update to roll back; no changes applied.',
    updateWarnings: [
      'A program update does not install or update third-party skill packages.',
      'Only the explicit files listed in the manifest are written; dependencies are never installed and the CLI is restarted manually.',
      'SHA-256 provides integrity, not publisher identity or a signed release. Private repositories and tokens are unsupported.',
    ],
    profileDefaultName: 'SeroAI profile',
    profilePreview: 'PROFILE RESTORE PREVIEW — No changes applied.',
    profileApplied: 'Profile applied to the OpenCode project with a backup; other clients were deferred.',
    profileNothingApplied: 'No supported adapter for the selected clients; no changes applied.',
    profileDeferredClient: 'client is not applied in this version; configure it manually.',
    uiStarted: 'SeroAI panel is ready. The address carries a session token; do not share it. Open in a browser:',
    uiStopHint: 'Press Ctrl+C to stop.',
    installPreview: 'INSTALL PREVIEW — No files written; no content downloaded.',
    installTargets: { project: 'Project target', global: 'Global target' },
    installApplied: 'Install approved; files verified and ownership state written.',
    installUnchanged: 'Selected skills are already installed and unchanged; no files written.',
    installRollbackPreview: 'INSTALL ROLLBACK PREVIEW — No changes applied.',
    installRolledBack: 'The last install was rolled back; the previous ownership state was restored.',
    noInstallRollback: 'No recorded install to roll back; no changes applied.',
    installInterrupted: 'An interrupted install was found; rollback completes that transaction.',
    installDoctor: 'INSTALL STATE — No files changed.',
    installDoctorEmpty: 'No SeroAI install record for this target.',
    installStates: { unchanged: 'unchanged', modified: 'modified', missing: 'missing', unsafe: 'unsafe' },
    uninstallPreview: 'UNINSTALL PREVIEW — No files deleted.',
    uninstallApplied: 'Selected skills were removed; user files were preserved.',
    noUninstall: 'No recorded skills to remove; no changes applied.',
    uninstallAction: 'owned files will be deleted',
    installNoLicense: 'no license',
    installReasons: {
      'license-missing': 'no license declared; not installed automatically',
      'upstream-cli': 'upstream CLI/tool; no file install',
      'config-only': 'config entry; use opencode-project --github',
    },
    installWarnings: [
      'Sources are downloaded from pinned GitHub commits; upstream behavior or quality is not verified.',
      'Only skill files are installed; MCP, hooks, plugins, commands and other clients are unchanged.',
      'Installed files go to the OpenCode discovery folder; later user edits are never overwritten.',
    ],
    inspectionWarningTexts: inspectionWarnings,
    warningTexts: warnings,
    errors: {
      INVALID_ARGUMENTS: 'Invalid command, flag or flag value. See help for usage.',
      INVALID_SELECTION: 'Select at least one client and one package explicitly.',
      UNKNOWN_PACKAGE: 'Unknown package ID. See catalog for available IDs.',
      UNKNOWN_CLIENT: 'Unknown client ID. See catalog for available IDs.',
      NOT_IMPLEMENTED: 'This command is not implemented yet. See help for available commands.',
      INVALID_CATALOG: 'Catalog or version files are missing or invalid.',
      INTERNAL_ERROR: 'The operation could not finish. No installation was started.',
      INVALID_WORKSPACE: 'A safe, private, existing absolute workspace path is required.',
      INVALID_WORKSPACE_RECORD: 'The workspace ownership record is invalid or cannot be read safely.',
      INSPECTION_FAILED: 'Workspace inspection could not finish; no changes were applied.',
      APPROVAL_REQUIRED: 'Explicit approval matching the current preview ID is required. Generate a new preview.',
      STALE_PLAN: 'The preview is stale or no pending transaction remains. Generate a new preview.',
      INVALID_PLAN: 'The recovery plan is invalid or has already been used.',
      INVALID_JOURNAL: 'The recovery journal or backup is invalid; recovery was not started.',
      CONFLICT: 'File state does not match the transaction record; stopped to preserve user changes.',
      UNSAFE_FILE: 'An unsafe file or link was detected; the operation was not started.',
      WORKSPACE_BUSY: 'The writer is still running or a recovery lock exists. Locks are not removed automatically.',
      RECOVERY_REQUIRED: 'Recovery could not finish. Stopped with the journal and backups retained; manual inspection may be needed.',
      INVALID_ADAPTER_OPTIONS: 'Select at least one valid absolute skill directory, .md instruction file or GitHub integration. Remote paths, globs and path escapes are not accepted.',
      UNSUPPORTED_CLIENT_VERSION: 'This adapter targets OpenCode V2 documentation only; other versions are unverified.',
      INVALID_PROJECT: 'A safe absolute project with a real .git directory is required. Worktree links and non-Git folders remain manual in this version.',
      INVALID_PROJECT_CONFIG: 'Project configuration could not be processed as safe JSON/JSONC with unique keys.',
      CONFIG_CONFLICT: 'Existing settings, legacy V1 shape or a higher-precedence config conflicts; nothing was overwritten.',
      INVALID_SOURCE: 'A selected local source is missing, empty or exceeds safe file/count/size limits.',
      INVALID_PROJECT_STATE: 'Private project state or backup could not be safely verified; manual inspection is required.',
      PROJECT_APPLY_FAILED: 'Project settings could not be applied; the previous file was preserved or restored.',
      BACKUP_FAILED: 'Backup and transaction state could not finish; target settings were not written.',
      UNSAFE_PATH: 'An unsafe path or symbolic ancestor link was rejected.',
      INVALID_UPDATE_SOURCE: 'Invalid update source. Only HTTPS GitHub addresses and local folders are accepted; tokens and private repositories are unsupported.',
      UPDATE_SOURCE_UNAVAILABLE: 'The update source is unreachable or lacks expected files. No files were written.',
      INVALID_UPDATE_MANIFEST: 'The update manifest, version file or version number is invalid. No files were written.',
      UPDATE_INTEGRITY_FAILED: 'Downloaded content failed its size or SHA-256 check; no files were written.',
      INVALID_UPDATE_TARGET: 'The update target is not a safe SeroAI installation or exceeds size limits.',
      UNOWNED_UPDATE_FILE: 'A file not owned by SeroAI exists at a target; nothing was overwritten.',
      UPDATE_APPLY_FAILED: 'The update could not be applied; previous files were restored and the backup retained.',
      INVALID_UPDATE_STATE: 'Update state or backup could not be safely verified; manual inspection is required.',
      INVALID_PROFILE: 'Invalid profile file: it contains an unknown field, a path, a secret or a selection outside the catalog.',
      INVALID_PROFILE_SOURCE: 'Invalid profile source. The key must be lowercase and the kind must be skill or instruction.',
      INVALID_PROFILE_MAPPING: 'Invalid mapping: every profile source needs an absolute path; missing, extra or relative paths are rejected.',
      UI_NOT_FOUND: 'Interface endpoint not found.',
      UI_UNAUTHORIZED: 'Session token is missing or invalid. Restart the panel.',
      UI_FORBIDDEN: 'The request does not come from this panel; nothing was changed.',
      UI_UNSUPPORTED_MEDIA: 'Only an application/json body is accepted.',
      UI_PAYLOAD_TOO_LARGE: 'The request body exceeds the 256 KiB limit.',
      UI_METHOD_NOT_ALLOWED: 'This method is not supported.',
      UI_INVALID_REQUEST: 'The request body is invalid JSON or contains an unknown field.',
      INVALID_INSTALL_SOURCE: 'Invalid install source: pin, license or repository field failed validation.',
      INSTALL_SOURCE_UNAVAILABLE: 'The install source is unreachable or lacks expected files; no files were written.',
      INVALID_ARCHIVE: 'The downloaded archive could not be opened safely; no files were written.',
      INVALID_INSTALL_STATE: 'Install state or ownership record could not be safely verified.',
      INVALID_INSTALL_TARGET: 'The install target is not a safe client folder. Global installs require an existing OpenCode configuration folder.',
      INSTALL_INTEGRITY_FAILED: 'Downloaded content did not match the tree record; no files were written.',
      INSTALL_APPLY_FAILED: 'The install could not be applied; the previous state was restored.',
      DUPLICATE_SKILL: 'The same skill name appears in two packages; stopped to avoid a collision.',
      INSTALL_NOT_ALLOWED: 'This package is not eligible for automatic install: license, kind or layout limit.',
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

export function localizeInspection(inspection, language) {
  return {
    ...inspection,
    warnings: inspection.warnings.map(warning => messages[language].inspectionWarningTexts[inspectionWarnings.indexOf(warning)] ?? warning),
  };
}

export function localizeOpenCodePreview(preview, language) {
  return {
    ...preview,
    warnings: preview.warnings.map(warning => messages[language].openCodeWarningTexts[openCodeWarnings.indexOf(warning)] ?? warning),
  };
}

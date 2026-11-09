# Üçüncü taraf bağımlılığı

`jsonc-parser@3.3.1` — [Microsoft / node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser), MIT.

Kullanım nedeni: OpenCode JSONC dosyalarındaki yorumları ve ilgisiz alanları silmeden konumsal ekleme yapmak. Kendi JSONC ayrıştırıcımızı yazmak veya config dosyasını bütünüyle yeniden üretmek yerine bu küçük bağımlılık seçildi. Sürüm ve npm paket bütünlüğü `package-lock.json` içinde sabittir. Yükleme `--ignore-scripts` ile yapıldı; dependency installer betiği çalıştırılmadı.

Bu, katalogdaki beceri paketlerinin kodunu depoya gömmek veya onların lisanslarını incelemek anlamına gelmez. SeroAI’ın kendi lisansı ayrıca seçilmelidir; bu dosya SeroAI’a MIT lisansı atamaz.

# Store listing paste pack

For whoever has dashboard access. The Chrome Web Store API has no listing-metadata endpoint, so these fields are pasted by hand. Source of truth is `storefront/listing.json`; this file is a ready-to-paste copy for version 3.6.1. If the two differ, `listing.json` wins: re-run the copy from it.

Shared values:

- Support URL: https://github.com/SylphxAI/Google-Photos-Delete-Tool/issues
- Privacy URL: https://sylphxai.github.io/Google-Photos-Delete-Tool/privacy.html
- Homepage: https://sylphxai.github.io/Google-Photos-Delete-Tool/
- Screenshots: see [Screenshots](#screenshots).

## Translation review status

| Locale | Status |
|---|---|
| en | source copy |
| de | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| es | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| fr | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| it | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| nl | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| pt_BR | wants a native read before or soon after pasting (draft written by us, not yet read by a native speaker) |
| zh_CN | lead-reviewed in style; no native read required |
| zh_TW | lead-reviewed in style; no native read required |
| ja | lead-reviewed in style; no native read required |

## 1. Chrome Web Store, per language

Do once per language below.

1. Open the Chrome Web Store Developer Dashboard and select the item Google Photos Delete Tool.
2. Go to Store listing.
3. Use the language selector at the top and choose Add language, then pick the language.
4. Title and Summary: these come from the package (`_locales/<code>/messages.json`, fields appName and appDescription). Check the dashboard shows the same text as listed below; if the field is editable and empty, paste it from here.
5. Description: paste the text from the block for that language.
6. Screenshots stay the existing ones (see [Screenshots](#screenshots)); no per-language screenshots are needed.
7. Save draft; submit for review once all languages are done (one submission covers them all).

CWS limits: summary 132 characters ([Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)). The public CWS docs ([Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)) state no description length; the repo's working cap is 16,000 characters (listing:check), and every description below is about 2,500 or less, so it is well under any plausible limit. If the dashboard shows a counter or error, report it.

### English (en)

Review: source copy. Description length: 2411 characters.

Title:

```text
Google Photos Delete Tool – Duplicate Finder & Bulk Delete
```

Summary:

```text
Bulk delete Google Photos and find the duplicates it misses. Dry run first, batches of 500, 60-day Trash, runs in your browser.
```

Description:

```text
Delete thousands of Google Photos in one run, and find the look-alike duplicates Google Photos keeps. Preview exactly what will go before anything is touched. Free, open source, and everything runs in your browser.

WHY PEOPLE USE IT
• Google Photos has no "delete all". This extension does the select, trash and confirm loop for you, in batches of up to 500, until the view you chose is empty.
• Google Photos removes only exact copies. Find duplicates also catches resized, re-saved, lightly edited and twice-uploaded copies, keeps the best one and marks the rest for Trash.

HOW IT WORKS
1. Open the view you want to clean: your library, an album or a search.
2. Run a dry run. It scrolls and counts what matches without clicking anything.
3. Confirm once and watch it delete in batches. Pause, resume or stop at any time.

SAFE BY DESIGN
• Nothing runs until you confirm, and nothing is ever scheduled or unattended.
• Deleted photos go to Google Photos Trash, where you can restore them for 60 days.
• "Empty trash afterwards" is optional, asks you first, and is reported done only after the Trash is checked empty.
• If Google changes a button the tool cannot positively identify, it stops instead of guessing.

FREE FOREVER
• Bulk delete in batches of up to 500
• Dry run that clicks nothing
• Find duplicates with a similarity slider; every group keeps at least one photo
• Optional, verified Empty trash
• Pause, resume and stop
• Interface in 10 languages

PRO, US$9.99 ONCE (no subscription, no account)
• Type filters: delete only screenshots, videos, photos, animations or collages
• Date filter: before, after or between two dates (reads dates shown in English or French)
• Up to 20 saved presets for cleanups you repeat
• Duplicate tools: keep the newest or oldest in every group, auto-accept groups 98% or more alike, CSV export
• Dry-run report with CSV export
Pro is a token you paste into the extension. It is checked on your device and works offline.

PRIVATE
The extension collects nothing: no analytics, no telemetry, no server. Your photos, thumbnails and fingerprints never leave your browser. Open source under the MIT licence.

Help: hi@sylphx.com or GitHub issues. Also available as a userscript for Tampermonkey and Violentmonkey.

Google Photos is a trademark of Google LLC. This extension is independent and not affiliated with or endorsed by Google.

by Sylphx · https://sylphx.com
```

### German (de)

Review: wants a native read. Description length: 2604 characters.

Title:

```text
Google Fotos Löschtool – Duplikate finden & Massenlöschen
```

Summary:

```text
Doppelte Fotos finden und in Google Fotos in großen Mengen löschen. Erst Testlauf, dann Papierkorb. Läuft lokal im Browser.
```

Description:

```text
Google Fotos löschen, Duplikate finden, aufräumen: Google Fotos Löschtool räumt deine Mediathek auf, ohne dass du Foto für Foto anklicken musst. Es findet doppelte und sehr ähnliche Fotos und löscht in großen Mengen, in sicheren Stapeln von bis zu 500.

Duplikate finden: Google Fotos entfernt nur exakte Kopien derselben Datei. Diese Erweiterung findet zusätzlich ähnliche Fotos (verkleinert, neu gespeichert, leicht bearbeitet oder doppelt hochgeladen) in der Ansicht, die du wählst. Sie scrollt die Ansicht, vergleicht kleine Vorschaubilder auf deinem Computer und zeigt ähnliche Fotos in Gruppen. Die beste Version bleibt erhalten, der Rest wird für den Papierkorb markiert, und du kannst jedes Foto umstellen. Ein Schieberegler legt fest, wie streng verglichen wird. Es wird nichts hochgeladen.

Massenlöschen: Google Fotos bietet kein „Alle löschen“. Die Erweiterung automatisiert die mühsame Abfolge aus Auswählen, Papierkorb und Bestätigen in Stapeln von bis zu 500 Fotos, damit du Speicherplatz in Minuten zurückholst. Alles läuft in deinem Browser: Sie klickt dieselben Elemente, die du selbst anklicken würdest, und hält an, sobald sie eine Schaltfläche nicht sicher erkennt.

Sicherheit zuerst

Testlauf: zählt die aktuelle Ansicht, ohne etwas anzuklicken.

Einwilligung: Vor dem ersten echten Lauf bestätigst du, was passieren wird. Nichts läuft automatisch oder unbeaufsichtigt.

Papierkorb: Gelöschte Fotos landen 60 Tage lang im Papierkorb von Google Fotos. „Papierkorb danach leeren“ ist optional, endgültig und wird erst als erledigt gemeldet, wenn der Papierkorb nachweislich leer ist.

Sofort stoppen: Pausieren, fortsetzen oder beenden jederzeit möglich.

Funktionen: Stapellöschen mit Auto-Scroll, Testlauf, optionales Papierkorb-Leeren, Pausieren/Fortsetzen/Stoppen, Oberfläche in 10 Sprachen und eine „Problem melden“-Schaltfläche, die ein vorausgefülltes GitHub-Issue öffnet.

Kostenlos und Pro: Löschfunktion, Testlauf, Duplikatsuche und Papierkorb-Leeren sind dauerhaft kostenlos. Pro (einmalig 9,99 US-Dollar, kein Abo) schaltet Typ- und Datumsfilter frei (Screenshots, Videos, Animationen, Collagen, Fotos; vor, nach oder zwischen Datumsangaben), gespeicherte Bereinigungs-Voreinstellungen und Werkzeuge für die Duplikatprüfung (Behalte-Regel, automatisches Übernehmen fast identischer Gruppen, CSV-Export). Die Lizenzprüfung läuft lokal: kein Konto, kein Server.

Datenschutz: Läuft lokal in deinem Browser. Es wird nichts hochgeladen, es gibt keine Server und keine Telemetrie. Open Source (MIT).

Google Fotos ist eine Marke von Google LLC.

von Sylphx · https://sylphx.com
```

### Spanish (es)

Review: wants a native read. Description length: 2536 characters.

Title:

```text
Borrar Google Fotos – Buscador de duplicados y borrado masivo
```

Summary:

```text
Encuentra fotos duplicadas y bórralas en masa en Google Fotos. Primero una prueba, luego a la papelera. Todo corre en tu navegador.
```

Description:

```text
Borrar Google Fotos, buscar fotos duplicadas y limpiar tu biblioteca sin hacer clic foto por foto. Google Fotos: Borrado masivo encuentra fotos duplicadas y parecidas y las elimina en lotes seguros de hasta 500.

Buscar duplicados: Google Fotos solo elimina copias exactas del mismo archivo. Esta extensión también encuentra copias parecidas (redimensionadas, guardadas de nuevo, ligeramente editadas o subidas dos veces) en la vista que elijas. Recorre la vista, compara miniaturas en tu ordenador y muestra las parecidas en grupos. Se conserva la mejor copia, el resto se marca para la papelera y puedes cambiar cualquier foto. Un control deslizante ajusta lo estricta que es la comparación. No se sube nada.

Borrado masivo: Google Fotos no tiene “borrar todo”. La extensión automatiza el tedioso ciclo de seleccionar, enviar a la papelera y confirmar, en lotes de hasta 500, para que recuperes espacio en minutos. Todo se ejecuta en tu navegador: pulsa los mismos elementos que pulsarías tú y se detiene en cuanto no puede identificar un botón con seguridad.

Seguridad ante todo

Prueba en seco: cuenta la vista actual sin pulsar nada.

Confirmación: antes de la primera ejecución real confirmas lo que va a ocurrir. Nada se programa ni se ejecuta sin supervisión.

Papelera de 60 días: las fotos borradas van a la papelera de Google Fotos y permanecen allí 60 días. “Vaciar la papelera después” es opcional, definitivo y solo se da por hecho cuando se comprueba que la papelera está vacía.

Parada inmediata: pausa, reanuda o detén el proceso cuando quieras.

Funciones: borrado por lotes con desplazamiento automático, prueba en seco, vaciado opcional de la papelera, pausar/reanudar/detener, interfaz en 10 idiomas y un botón de “Informar de un problema” que abre una incidencia de GitHub ya rellenada.

Gratis y Pro: el motor de borrado, la prueba en seco, el buscador de duplicados y el vaciado de papelera son gratis para siempre. Pro (pago único de 9,99 US$, sin suscripción) desbloquea filtros por tipo y fecha (capturas de pantalla, vídeos, animaciones, collages, fotos; antes de, después de o entre fechas), ajustes guardados de limpieza y herramientas de revisión de duplicados (regla de conservar, aceptación automática de grupos casi idénticos, exportación a CSV). La licencia se verifica en local: sin cuenta y sin servidor.

Privacidad: funciona en local en tu navegador. No se sube nada, no hay servidores ni telemetría. Código abierto (MIT).

Google Fotos es una marca de Google LLC.

de Sylphx · https://sylphx.com
```

### French (fr)

Review: wants a native read. Description length: 2690 characters.

Title:

```text
Suppression Google Photos – Doublons et suppression en masse
```

Summary:

```text
Trouvez les doublons et supprimez en masse dans Google Photos. Simulation d’abord, puis corbeille. Tout reste dans votre navigateur.
```

Description:

```text
Supprimer des photos Google Photos, trouver les doublons et faire le ménage sans cliquer photo par photo : Suppression Google Photos repère les doublons et les photos très proches, puis les supprime en masse, par lots sûrs de 500 maximum.

Trouver les doublons : Google Photos ne retire que les copies exactes d’un même fichier. Cette extension trouve aussi les copies semblables (redimensionnées, réenregistrées, légèrement retouchées ou importées deux fois) dans la vue de votre choix. Elle fait défiler la vue, compare de petites vignettes sur votre ordinateur et présente les photos semblables par groupes. La meilleure copie est conservée, les autres sont marquées pour la corbeille, et vous pouvez changer n’importe quelle photo. Un curseur règle la sévérité de la comparaison. Rien n’est envoyé.

Suppression en masse : Google Photos n’a pas de « tout supprimer ». L’extension automatise la boucle fastidieuse sélectionner, mettre à la corbeille, confirmer, par lots de 500 maximum, pour récupérer de l’espace en quelques minutes. Tout se passe dans votre navigateur : elle clique sur les mêmes éléments que vous et s’arrête dès qu’elle ne peut pas identifier un bouton avec certitude.

La sécurité d’abord

Simulation : compte la vue actuelle sans rien cliquer.

Confirmation : avant la première exécution réelle, vous confirmez ce qui va se passer. Rien n’est planifié ni lancé sans vous.

Corbeille de 60 jours : les photos supprimées vont dans la corbeille de Google Photos, où elles restent 60 jours. « Vider la corbeille ensuite » est facultatif, définitif, et n’est annoncé comme terminé qu’une fois la corbeille vérifiée vide.

Arrêt immédiat : pause, reprise ou arrêt à tout moment.

Fonctions : suppression par lots avec défilement automatique, simulation, vidage facultatif de la corbeille, pause/reprise/arrêt, interface en 10 langues et un bouton « Signaler un problème » qui ouvre un ticket GitHub prérempli.

Gratuit et Pro : le moteur de suppression, la simulation, la recherche de doublons et le vidage de la corbeille sont gratuits pour toujours. Pro (9,99 $ US une seule fois, sans abonnement) débloque les filtres par type et par date (captures d’écran, vidéos, animations, collages, photos ; avant, après ou entre deux dates), les préréglages de nettoyage enregistrés et les outils de revue des doublons (règle de conservation, acceptation automatique des groupes quasi identiques, export CSV). La licence est vérifiée en local : ni compte ni serveur.

Confidentialité : fonctionne en local dans votre navigateur. Rien n’est envoyé, aucun serveur, aucune télémétrie. Open source (MIT).

Google Photos est une marque de Google LLC.

par Sylphx · https://sylphx.com
```

### Italian (it)

Review: wants a native read. Description length: 2529 characters.

Title:

```text
Elimina Google Foto – Trova duplicati ed elimina in blocco
```

Summary:

```text
Trova le foto duplicate ed eliminale in blocco su Google Foto. Prima una prova, poi il cestino. Tutto gira nel tuo browser.
```

Description:

```text
Eliminare Google Foto, trovare le foto duplicate e fare ordine senza cliccare foto per foto: Elimina Google Foto trova duplicati e foto molto simili e li elimina in blocco, in lotti sicuri fino a 500.

Trova duplicati: Google Foto rimuove solo le copie esatte dello stesso file. Questa estensione trova anche le copie simili (ridimensionate, risalvate, modificate di poco o caricate due volte) nella vista che scegli. Scorre la vista, confronta piccole miniature sul tuo computer e mostra le foto simili in gruppi. La copia migliore viene tenuta, le altre sono segnate per il cestino e puoi cambiare qualsiasi foto. Un cursore regola quanto è rigoroso il confronto. Non viene caricato nulla.

Eliminazione in blocco: Google Foto non ha un “elimina tutto”. L’estensione automatizza il noioso ciclo seleziona, sposta nel cestino, conferma, in lotti fino a 500, così recuperi spazio in pochi minuti. Tutto avviene nel tuo browser: clicca gli stessi elementi che cliccheresti tu e si ferma appena non riesce a riconoscere con certezza un pulsante.

Prima la sicurezza

Prova a secco: conta la vista corrente senza cliccare nulla.

Conferma: prima della prima esecuzione reale confermi cosa sta per succedere. Niente viene pianificato né avviato senza di te.

Cestino di 60 giorni: le foto eliminate vanno nel cestino di Google Foto, dove restano 60 giorni. “Svuota il cestino dopo” è facoltativo, definitivo e viene segnalato come completato solo dopo aver verificato che il cestino sia vuoto.

Stop immediato: metti in pausa, riprendi o ferma quando vuoi.

Funzioni: eliminazione a lotti con scorrimento automatico, prova a secco, svuotamento facoltativo del cestino, pausa/ripresa/stop, interfaccia in 10 lingue e un pulsante “Segnala un problema” che apre una segnalazione GitHub già compilata.

Gratis e Pro: il motore di eliminazione, la prova a secco, la ricerca dei duplicati e lo svuotamento del cestino sono gratuiti per sempre. Pro (una tantum, 9,99 USD, nessun abbonamento) sblocca i filtri per tipo e data (screenshot, video, animazioni, collage, foto; prima di, dopo o tra due date), le impostazioni di pulizia salvate e gli strumenti di revisione dei duplicati (regola di conservazione, accettazione automatica dei gruppi quasi identici, esportazione CSV). La licenza si verifica in locale: nessun account, nessun server.

Privacy: funziona in locale nel tuo browser. Non viene caricato nulla, nessun server, nessuna telemetria. Open source (MIT).

Google Foto è un marchio di Google LLC.

di Sylphx · https://sylphx.com
```

### Dutch (nl)

Review: wants a native read. Description length: 2529 characters.

Title:

```text
Google Foto’s Verwijderen – Dubbele foto’s vinden & bulk wissen
```

Summary:

```text
Vind dubbele foto’s en verwijder ze in bulk in Google Foto’s. Eerst een proefrun, dan prullenbak. Draait lokaal in je browser.
```

Description:

```text
Google Foto’s verwijderen, dubbele foto’s vinden en opruimen zonder foto voor foto te klikken: Google Foto’s Verwijderen vindt dubbele en bijna identieke foto’s en wist ze in bulk, in veilige batches van maximaal 500.

Dubbele foto’s vinden: Google Foto’s verwijdert alleen exacte kopieën van hetzelfde bestand. Deze extensie vindt ook gelijkende kopieën (verkleind, opnieuw opgeslagen, licht bewerkt of twee keer geüpload) in de weergave die jij kiest. Ze scrolt door de weergave, vergelijkt kleine miniaturen op je computer en toont gelijkende foto’s in groepen. De beste kopie blijft staan, de rest wordt gemarkeerd voor de prullenbak en je kunt elke foto omwisselen. Een schuifregelaar bepaalt hoe streng er wordt vergeleken. Er wordt niets geüpload.

Bulk verwijderen: Google Foto’s heeft geen “alles verwijderen”. De extensie automatiseert de vervelende cyclus selecteren, naar de prullenbak, bevestigen in batches van maximaal 500, zodat je binnen minuten opslagruimte terugwint. Alles draait in je browser: ze klikt op dezelfde elementen als jij en stopt zodra ze een knop niet zeker kan herkennen.

Veiligheid eerst

Proefrun: telt de huidige weergave zonder ergens op te klikken.

Toestemming: vóór de eerste echte run bevestig je wat er gaat gebeuren. Er wordt niets ingepland of onbeheerd uitgevoerd.

Prullenbak van 60 dagen: verwijderde foto’s gaan naar de prullenbak van Google Foto’s en blijven daar 60 dagen. “Prullenbak daarna legen” is optioneel, definitief en wordt pas als klaar gemeld nadat de prullenbak aantoonbaar leeg is.

Direct stoppen: pauzeren, hervatten of stoppen kan altijd.

Functies: batchgewijs verwijderen met automatisch scrollen, proefrun, optioneel prullenbak legen, pauzeren/hervatten/stoppen, interface in 10 talen en een knop “Probleem melden” die een ingevuld GitHub-issue opent.

Gratis en Pro: de verwijderfunctie, proefrun, duplicatenzoeker en prullenbak legen zijn voor altijd gratis. Pro (eenmalig US$ 9,99, geen abonnement) ontgrendelt filters op type en datum (screenshots, video’s, animaties, collages, foto’s; voor, na of tussen datums), opgeslagen opruimvoorinstellingen en hulpmiddelen voor het controleren van duplicaten (bewaarregel, automatisch accepteren van bijna identieke groepen, CSV-export). De licentie wordt lokaal gecontroleerd: geen account, geen server.

Privacy: draait lokaal in je browser. Er wordt niets geüpload, er zijn geen servers en geen telemetrie. Open source (MIT).

Google Foto’s is een handelsmerk van Google LLC.

door Sylphx · https://sylphx.com
```

### Portuguese, Brazil (pt_BR)

Review: wants a native read. Description length: 2508 characters.

Title:

```text
Excluir Google Fotos – Localizador de duplicadas e exclusão em massa
```

Summary:

```text
Encontre fotos duplicadas e exclua em massa no Google Fotos. Primeiro um teste, depois a lixeira. Tudo roda no seu navegador.
```

Description:

```text
Excluir fotos do Google Fotos, encontrar duplicadas e organizar a biblioteca sem clicar foto por foto: o Excluir Google Fotos encontra fotos duplicadas e muito parecidas e as exclui em massa, em lotes seguros de até 500.

Encontrar duplicadas: o Google Fotos só remove cópias exatas do mesmo arquivo. Esta extensão também encontra cópias parecidas (redimensionadas, salvas de novo, levemente editadas ou enviadas duas vezes) na visualização que você escolher. Ela rola a visualização, compara miniaturas no seu computador e mostra as parecidas em grupos. A melhor cópia é mantida, as demais ficam marcadas para a lixeira e você pode trocar qualquer foto. Um controle deslizante define o quanto a comparação é rigorosa. Nada é enviado.

Exclusão em massa: o Google Fotos não tem “excluir tudo”. A extensão automatiza o ciclo cansativo de selecionar, mover para a lixeira e confirmar, em lotes de até 500, para você recuperar espaço em minutos. Tudo roda no seu navegador: ela clica nos mesmos elementos que você clicaria e para assim que não consegue identificar um botão com certeza.

Segurança em primeiro lugar

Teste (dry run): conta a visualização atual sem clicar em nada.

Confirmação: antes da primeira execução real você confirma o que vai acontecer. Nada é agendado nem roda sem supervisão.

Lixeira de 60 dias: as fotos excluídas vão para a lixeira do Google Fotos e ficam lá por 60 dias. “Esvaziar a lixeira depois” é opcional, definitivo e só é dado como concluído depois de verificar que a lixeira está vazia.

Parada imediata: pause, retome ou pare a qualquer momento.

Recursos: exclusão em lotes com rolagem automática, teste, esvaziamento opcional da lixeira, pausar/retomar/parar, interface em 10 idiomas e um botão “Relatar problema” que abre uma issue do GitHub já preenchida.

Grátis e Pro: o mecanismo de exclusão, o teste, o localizador de duplicadas e o esvaziamento da lixeira são grátis para sempre. O Pro (pagamento único de US$ 9,99, sem assinatura) libera filtros por tipo e data (capturas de tela, vídeos, animações, colagens, fotos; antes de, depois de ou entre datas), predefinições de limpeza salvas e ferramentas de revisão de duplicadas (regra de manter, aceitação automática de grupos quase idênticos, exportação em CSV). A licença é verificada localmente: sem conta, sem servidor.

Privacidade: roda localmente no seu navegador. Nada é enviado, sem servidores e sem telemetria. Código aberto (MIT).

Google Fotos é uma marca da Google LLC.

por Sylphx · https://sylphx.com
```

### Chinese, Simplified (zh_CN)

Review: lead-reviewed in style. Description length: 896 characters.

Title:

```text
Google 相册批量删除工具 – 重复照片查找与批量清理
```

Summary:

```text
查找重复照片，批量删除 Google 相册中的照片。先试运行，删除的照片进入回收站。全部在浏览器本地运行。
```

Description:

```text
Google 相册批量删除、查找重复照片、一键清理：无需逐张点击。Google 相册批量删除工具可找出重复和高度相似的照片，并以最多 500 张一批的安全方式批量删除。

查找重复照片：Google 相册只会移除同一文件的完全相同副本。本扩展还能在你选定的视图中找出相似副本（缩放过、重新保存过、略有编辑或重复上传的照片）。它会滚动该视图，在你的电脑上比较小尺寸缩略图，并把相似照片分组显示。最佳副本会被保留，其余标记为移入回收站，任何一张都可以手动切换。相似度滑块可调整匹配的严格程度。不会上传任何内容。

批量删除：Google 相册没有“全部删除”。本扩展把繁琐的“选择 → 移入回收站 → 确认”流程自动化，每批最多 500 张，几分钟就能腾出存储空间。一切都在浏览器中运行：它只点击你本来会点击的界面元素，一旦无法确定某个按钮，就会立即停止。

安全第一

试运行：只统计当前视图，不点击任何内容。

确认步骤：首次正式运行前，需要你确认即将执行的操作。绝不会定时或无人值守地运行。

60 天回收站：删除的照片会进入 Google 相册回收站，并保留 60 天。“结束后清空回收站”为可选项，操作不可撤销，只有在确认回收站已清空后才会报告完成。

随时停止：可随时暂停、继续或停止。

功能：带自动滚动的分批删除、试运行、可选的清空回收站、暂停/继续/停止、10 种语言界面，以及可一键生成预填 GitHub issue 的“报告问题”按钮。

免费版与 Pro：删除引擎、试运行、重复照片查找和清空回收站永久免费。Pro（一次性付费 9.99 美元，无订阅）可解锁类型和日期筛选（截图、视频、动画、拼贴、照片；早于、晚于或介于两个日期之间）、已保存的清理预设，以及重复照片审核工具（保留规则、近乎相同分组自动接受、CSV 导出）。授权在本地验证：无需账号，无需服务器。

隐私：在你的浏览器本地运行。不上传任何内容，没有服务器，也没有遥测。开源（MIT）。

Google 相册是 Google LLC 的商标。

由 Sylphx 出品 · https://sylphx.com
```

### Chinese, Traditional (zh_TW)

Review: lead-reviewed in style. Description length: 906 characters.

Title:

```text
Google 相簿批次刪除工具 – 重複照片尋找與大量清理
```

Summary:

```text
尋找重複照片，批次刪除 Google 相簿中的照片。先試跑，刪除的照片會進入垃圾桶。全部在瀏覽器本機執行。
```

Description:

```text
Google 相簿批次刪除、尋找重複照片、快速清理：不必一張一張點選。Google 相簿批次刪除工具可找出重複與高度相似的照片，並以最多 500 張一批的安全方式批次刪除。

尋找重複照片：Google 相簿只會移除同一檔案的完全相同副本。本擴充功能還能在你選定的檢視中找出相似副本（縮放過、重新儲存過、稍有編輯或重複上傳的照片）。它會捲動該檢視，在你的電腦上比對小尺寸縮圖，並將相似照片分組顯示。最佳副本會被保留，其餘標記為移至垃圾桶，任何一張都可以手動切換。相似度滑桿可調整比對的嚴格程度。不會上傳任何內容。

批次刪除：Google 相簿沒有「全部刪除」。本擴充功能把繁瑣的「選取 → 移至垃圾桶 → 確認」流程自動化，每批最多 500 張，幾分鐘就能釋出儲存空間。一切都在瀏覽器中執行：它只點選你原本會點選的介面元素，一旦無法確定某個按鈕，就會立即停止。

安全第一

試跑：只統計目前的檢視，不點選任何內容。

確認步驟：首次正式執行前，需要你確認即將進行的操作。絕不會排程或在無人看管下執行。

60 天垃圾桶：刪除的照片會進入 Google 相簿垃圾桶，並保留 60 天。「完成後清空垃圾桶」為選用項目，操作無法復原，只有在確認垃圾桶已清空後才會回報完成。

隨時停止：可隨時暫停、繼續或停止。

功能：具自動捲動的分批刪除、試跑、選用的清空垃圾桶、暫停/繼續/停止、10 種語言介面，以及可一鍵產生預先填寫 GitHub issue 的「回報問題」按鈕。

免費版與 Pro：刪除引擎、試跑、重複照片尋找與清空垃圾桶永久免費。Pro（一次付費 9.99 美元，無需訂閱）可解鎖類型與日期篩選（螢幕截圖、影片、動畫、拼貼、照片；早於、晚於或介於兩個日期之間）、已儲存的清理預設，以及重複照片審核工具（保留規則、近乎相同群組自動接受、CSV 匯出）。授權在本機驗證：不需帳號，不需伺服器。

隱私：在你的瀏覽器本機執行。不會上傳任何內容，沒有伺服器，也沒有遙測。開源（MIT）。

Google 相簿是 Google LLC 的商標。

由 Sylphx 推出 · https://sylphx.com
```

### Japanese (ja)

Review: lead-reviewed in style. Description length: 1176 characters.

Title:

```text
Google フォト一括削除ツール – 重複写真の検出と一括削除
```

Summary:

```text
重複した写真を見つけて、Google フォトで一括削除。まずはドライラン、削除した写真はゴミ箱へ。処理はすべてブラウザ内で完結します。
```

Description:

```text
Google フォトの一括削除、重複写真の検出、整理を、1枚ずつ選ばずに。Google フォト一括削除ツールは、重複した写真やよく似た写真を見つけ、最大500枚ずつの安全なバッチでまとめて削除します。

重複写真を検出：Google フォトが取り除くのは、同一ファイルの完全なコピーだけです。この拡張機能は、選んだ表示範囲の中で、よく似たコピー（リサイズ、再保存、軽い編集、二重アップロードなど）も見つけます。表示をスクロールし、お使いのパソコン上で小さなサムネイルを比較して、似た写真をグループで表示します。いちばん良いコピーは残し、残りはゴミ箱行きとして印が付き、どの写真も切り替えられます。スライダーで一致の厳しさを調整できます。何もアップロードされません。

一括削除：Google フォトには「すべて削除」がありません。この拡張機能は、選択 → ゴミ箱へ移動 → 確認という面倒な繰り返しを、最大500枚ずつのバッチで自動化し、数分でストレージを空けます。すべてブラウザ内で動作し、人が押すのと同じ画面要素だけをクリックします。ボタンを確実に特定できなければ、その場で停止します。

安全性を最優先

ドライラン：現在の表示範囲を数えるだけで、何もクリックしません。

確認ステップ：最初の実行前に、これから行う内容を確認します。予約実行や無人実行は一切ありません。

60日間のゴミ箱：削除した写真は Google フォトのゴミ箱に60日間残ります。「完了後にゴミ箱を空にする」は任意で、元に戻せません。ゴミ箱が空になったことを確認してから完了と報告します。

即時停止：一時停止、再開、停止はいつでもできます。

機能：自動スクロール付きのバッチ削除、ドライラン、任意のゴミ箱を空にする操作、一時停止/再開/停止、10言語のUI、入力済みの GitHub issue を開く「問題を報告」ボタン。

無料版と Pro：削除エンジン、ドライラン、重複検出、ゴミ箱を空にする機能はずっと無料です。Pro（買い切り 9.99米ドル、サブスクなし）では、種類・日付フィルター（スクリーンショット、動画、アニメーション、コラージュ、写真。指定日より前、後、または2つの日付の間）、保存できるクリーンアッププリセット、重複レビューツール（残すコピーのルール、ほぼ同一のグループの自動承認、CSV エクスポート）が使えます。ライセンスの確認はローカルで行われ、アカウントもサーバーも不要です。

プライバシー：ブラウザ内でローカルに動作します。何もアップロードせず、サーバーもテレメトリーもありません。オープンソース（MIT）。

Google フォトは Google LLC の商標です。

Sylphx 提供 · https://sylphx.com
```

## 2. Edge Add-ons: first submission

Partner Center, Edge program, Microsoft Edge Add-ons, Create new extension. Values come from `listing.json` `edge`.

| Field | Value |
|---|---|
| Package | Latest GitHub release asset `google-photos-delete-tool-edge.zip` (https://github.com/SylphxAI/Google-Photos-Delete-Tool/releases/latest) |
| Name | Google Photos Delete Tool |
| Short description | see block below |
| Description | see block below |
| Search terms | duplicate photos, google photos, bulk delete, photo cleaner, duplicate finder (enter one per line; max 7 terms) |
| Category | Productivity |
| Logo (300x300) | `storefront/edge-logo-300.png`, raw URL https://raw.githubusercontent.com/SylphxAI/Google-Photos-Delete-Tool/master/storefront/edge-logo-300.png |
| Privacy policy URL | https://sylphxai.github.io/Google-Photos-Delete-Tool/privacy.html |
| Support / website URL | https://github.com/SylphxAI/Google-Photos-Delete-Tool/issues (website: https://sylphxai.github.io/Google-Photos-Delete-Tool/) |
| Screenshots | see [Screenshots](#screenshots) |

Short description:

```text
Find and delete duplicate photos in Google Photos. Bulk delete safely: dry run, batches, empty trash.
```

Description:

```text
Find duplicates: Google Photos only removes exact copies of the same file. This extension also finds look-alike copies (resized, re-saved, slightly edited, or uploaded twice) in the view you choose. It scrolls the view, compares small thumbnails on your computer, and shows look-alikes in groups. The best copy is kept, the rest are marked for Trash, and you can switch any photo. A similarity slider sets how strict the match is. Nothing is uploaded.

Google Photos has no “delete all”. This extension automates the select → trash → confirm loop in safe batches of up to 500, so you can reclaim storage in minutes. Everything runs in your browser and stops the moment it cannot positively identify a button.

Safety: fail-closed multilingual button matching (unknown UI = stop, never guess), a consent gate on the first real run, deleted photos go to the 60-day Trash, empty-trash afterwards is opt-in and verified, and stop is instant.

Features: batch delete up to 500 per batch with auto-scroll, dry run that counts without clicking, verified empty trash (opt-in), pause/resume/stop, 9-language UI, and self-diagnosing issue reports.

Free vs Pro: the delete engine, dry run, and empty trash are free forever. A one-time Pro license adds type and date filters (screenshots, videos, animations, collages, photos) and the dry-run report/export. Verification is local — no account, no backend.

Privacy: zero data collection, zero servers, zero telemetry. Open source (MIT). Support: GitHub issues.

Google Photos is a trademark of Google LLC.

by Sylphx · https://sylphx.com
```

Notes: the description is English only; Edge picks up the localized name and short description from the package's `_locales`. Mark the extension as not collecting user data in the privacy questions (the privacy statement says zero data collection).

## 3. Firefox AMO

`.github/workflows/bootstrap-amo.yml` (via `scripts/amo-create.mjs`) sets these through the AMO API, so do not retype them:

- Add-on created and first version submitted from `google-photos-delete-tool-firefox.zip`
- Summary (en-US): Find and delete duplicate photos in Google Photos, and bulk-delete in safe batches of up to 500: dry-run first, empty trash optionally, stop anytime. Consent-gated, zero telemetry. Free forever; one-time Pro adds type and date filters. Open source.
- Categories: Photos, Music & Videos
- Licence: MIT
- Description (en-US), patched in after create

If the add-on has not been bootstrapped yet, dispatch the workflow instead of creating it by hand: `gh workflow run "Bootstrap AMO Add-on (manual, once)"`.

Set by hand in the AMO developer hub (Manage listing; the API cannot set these):

1. Icon: upload `src/extension/icons/icon-128.png` (128x128).
2. Screenshots: see [Screenshots](#screenshots).
3. Privacy policy: paste the full text of `PRIVACY.md` into the Privacy Policy field (AMO takes text, not a URL).
4. Support URL: https://github.com/SylphxAI/Google-Photos-Delete-Tool/issues
5. Homepage: https://github.com/SylphxAI/Google-Photos-Delete-Tool
6. Tags (optional, up to 10): google photos, duplicate photos, bulk delete, photo cleaner, privacy

## Screenshots

`listing.json` lists four real captures, all 1280x800. CWS asks for at least one 1280x800 screenshot, up to 5 ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)). Edge and AMO accept the same files; check the dashboard hint if it asks for another size.

- `dry-run.png` (1280x800): Dry run: counts the current view without clicking anything; Pro adds a per-type breakdown.
- `running.png` (1280x800): Real run: honest stats (deleted, rate, elapsed), pause/resume/stop, ETA after a dry-run total.
- `filters.png` (1280x800): Pro type filters: delete only screenshots, videos, animations, collages, or photos.
- `empty-trash.png` (1280x800): Empty trash (opt-in): only reported done after the trash is verified empty.

Use all four, in this order, on Chrome Web Store, Edge Add-ons and AMO. They are not committed to the repository: generate them with `node scripts/cws-screenshots.mjs` (writes to `storefront/screenshots/`, needs a signed-in Google Photos session; running and empty-trash shots need `--allow-destructive` and a person watching). If you cannot capture, `docs/images/find-duplicates.png` (1280x800, duplicate review) is committed and can be added as an extra screenshot.

# Store review replies

The vision targets a store rating of 4.5 or higher with every review answered
([vision.md](vision.md#target-metrics)). Ratings drive installs, and installs
drive Pro ([GROWTH.md](GROWTH.md)). This is the runbook for answering.

## Rules for every reply

- Reply in the reviewer's language. The templates below cover the ten
  languages the store listing ships (`_locales/`: en, de, es, fr, it, nl,
  pt_BR, zh_CN, zh_TW, ja). For any other language, reply in English.
- Be courteous and brief, whatever the star rating or tone. Thank first.
- Admit only the facts. "Google changed its page and the tool did not match
  it" is a fact; "our bug lost your photos" is not, unless a report proves it.
  Never blame the reviewer either.
- Give one concrete next step. Make no promise the product does not keep: no
  fix dates, no "never happens again", no refunds outside the policy below.
- Refund policy, as stated in the README: if Pro does not work as described and
  we cannot fix it, the buyer emails the support address (see the README Pro
  section) and we put it right or refund. Nothing wider. Never offer a refund
  for the free features, and never discuss a refund in a public reply beyond
  pointing to the email.
- Do not post personal data, license tokens or order ids in a reply.
- Replies are public and editable. The store does not notify the reviewer of a
  reply, so keep it useful to the next reader too. Edit a reply to add the
  outcome once an issue is fixed.
- The safety model in one line, for reference: nothing is deleted unless the
  person chose or approved it; recovery requires items still in Trash under
  Google Photos’ current policy. Empty Trash and any permanent deletion
  cannot be undone. Never promise a fixed recovery window.

## Which template

| Review says | Template |
|---|---|
| Stopped working, nothing happens, button not found | [A. Stopped working](#a-it-stopped-working) |
| Deleted the wrong photos, lost photos | [B. Wrong photos](#b-deleted-the-wrong-photos) |
| Slow | [C. Slow](#c-its-slow) |
| Pro price, activation, refund | [D. Pro and refunds](#d-pro-questions-and-refunds) |
| Wants a feature | [E. Feature request](#e-feature-requests) |
| Positive | [F. Thanks](#f-5-star-thanks) |

Mixed review: answer the complaint, then thank them for the rest.

## A. It stopped working

Cause is usually Google Photos changing its page (selector drift). The
extension stops rather than guess; the fix is a selector-pack patch. Next step
for the user: the **Report issue** button in the popup, which opens a
pre-filled GitHub issue with the pack version and what matched. Link
[CANARY.md](CANARY.md) at most once, in the first reply, and only if the
reviewer is technical or asks how drift is found; otherwise leave it out.

**en** Thanks for telling us, and sorry it let you down. Google Photos changes its page now and then, and the tool stops instead of guessing at a delete button. Please open the extension and press "Report issue"; it creates a pre-filled GitHub issue with the details we need to patch it. How we watch for these changes: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**de** Danke für die Rückmeldung, und schade, dass es nicht geklappt hat. Google Fotos ändert gelegentlich seine Seite, und das Tool stoppt, statt eine Löschschaltfläche zu raten. Bitte öffne die Erweiterung und klicke auf "Problem melden"; das erstellt ein vorausgefülltes GitHub-Issue mit den Angaben, die wir für den Fix brauchen. So beobachten wir solche Änderungen: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**es** Gracias por avisarnos, y lamentamos que no funcionara. Google Fotos cambia su página de vez en cuando y la herramienta se detiene en lugar de adivinar un botón de borrado. Abre la extensión y pulsa "Informar de un problema"; crea una incidencia de GitHub ya rellenada con los datos que necesitamos para corregirlo. Así vigilamos estos cambios: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**fr** Merci de nous le signaler, et désolé que cela n'ait pas fonctionné. Google Photos modifie sa page de temps à autre, et l'outil s'arrête au lieu de deviner un bouton de suppression. Ouvrez l'extension et cliquez sur "Signaler un problème" : cela crée un ticket GitHub prérempli avec les informations dont nous avons besoin pour le corriger. Voici comment nous surveillons ces changements : https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**it** Grazie della segnalazione, ci dispiace che non abbia funzionato. Google Foto cambia ogni tanto la sua pagina e lo strumento si ferma invece di indovinare un pulsante di eliminazione. Apri l'estensione e premi "Segnala un problema": crea una segnalazione GitHub già compilata con i dati che ci servono per correggerlo. Come monitoriamo questi cambiamenti: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**nl** Bedankt voor je melding, en jammer dat het niet werkte. Google Foto's past af en toe de pagina aan, en de tool stopt dan in plaats van een verwijderknop te raden. Open de extensie en druk op "Probleem melden"; dat maakt een ingevuld GitHub-issue met de gegevens die we nodig hebben om het te herstellen. Zo houden we zulke wijzigingen in de gaten: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**pt_BR** Obrigado por avisar, e sentimos que não tenha funcionado. O Google Fotos muda a página de vez em quando e a ferramenta para em vez de adivinhar um botão de exclusão. Abra a extensão e clique em "Relatar problema"; isso cria uma issue no GitHub já preenchida com os dados de que precisamos para corrigir. Veja como acompanhamos essas mudanças: https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**zh_CN** 感谢反馈，抱歉给您带来不便。Google 相册偶尔会改版，工具遇到无法确认的删除按钮时会停止，而不是乱猜。请打开扩展并点击"报告问题"，它会生成一个已填好信息的 GitHub issue，我们据此修复。我们如何监测这类改版：https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**zh_TW** 感謝回報，抱歉造成不便。Google 相簿偶爾會改版，工具遇到無法確認的刪除按鈕時會停止，而不是亂猜。請開啟擴充功能並按「报告问题」，它會建立一則已填好資料的 GitHub issue，我們會依此修復。我們如何監測這類改版：https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

**ja** ご連絡ありがとうございます。うまく動かずご迷惑をおかけしました。Google フォトは時々ページが変わり、その際このツールは削除ボタンを推測せず停止します。拡張機能を開いて「問題を報告」を押すと、修正に必要な情報が入力済みの GitHub issue が作成されます。変更の検知方法はこちらです：https://github.com/SylphxAI/Google-Photos-Delete-Tool/blob/master/docs/CANARY.md

## B. Deleted the wrong photos

Stay calm and factual. The tool only moves to Trash what the person chose or
approved (in Find duplicates, each keep/Trash choice is reviewed, and the
person presses Move to Trash and confirms). Do not argue about whether they
chose it, and do not admit a defect without a report that shows one. The
recovery step is concrete: check Trash now and restore only items that are
still there and eligible under Google Photos’ current policy. Empty Trash
and any permanent deletion cannot be undone. If Trash is already empty,
say so honestly and do not promise recovery. Never advise emptying Trash
as a recovery step; if it is full, do not approve permanent deletion of
items the person needs to restore.

Official desktop [delete guidance](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop)
and [restore guidance](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)
checked 2026-10-29; re-read the current conditions before replying.
[Policy notes and delivery boundaries](RECOVERY.md).

**en** We’re sorry you’re worried about your photos. Only if the items are still in Trash and Google Photos’ current policy allows it. Open Google Photos Trash, select the items and choose Restore. Empty Trash and any permanent deletion cannot be undone. A full Trash may prompt permanent deletion instead. Check Google’s guidance before deleting. [Google Photos desktop delete guidance (checked 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Photos desktop restore guidance (checked 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**de** Es tut uns leid, dass du dir Sorgen um deine Fotos machst. Nur wenn die Elemente noch im Papierkorb sind und die aktuelle Richtlinie von Google Fotos es erlaubt. Öffne den Papierkorb von Google Fotos, wähle die Elemente und dann „Wiederherstellen“. Das Leeren des Papierkorbs und jede endgültige Löschung lassen sich nicht rückgängig machen. Bei vollem Papierkorb kann stattdessen eine endgültige Löschung angeboten werden. Lies vor dem Löschen die Hinweise von Google. [Google Fotos: Löschen am Computer (geprüft am 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Fotos: Wiederherstellen am Computer (geprüft am 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**es** Lamentamos que estés preocupado por tus fotos. Solo si los elementos siguen en la papelera y lo permite la política vigente de Google Fotos. Abre la papelera de Google Fotos, selecciona los elementos y elige Restaurar. Vaciar la papelera y cualquier eliminación permanente no se pueden deshacer. Si la papelera está llena, puede ofrecerse la eliminación permanente en su lugar. Consulta las instrucciones de Google antes de borrar. [Google Fotos: eliminar en ordenador (consultado el 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Fotos: restaurar en ordenador (consultado el 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**fr** Nous sommes désolés que vous vous inquiétiez pour vos photos. Uniquement si les éléments sont encore dans la corbeille et si les règles actuelles de Google Photos le permettent. Ouvrez la corbeille Google Photos, sélectionnez les éléments et choisissez Restaurer. Vider la corbeille et toute suppression définitive sont irréversibles. Une corbeille pleine peut proposer une suppression définitive à la place. Consultez les instructions de Google avant de supprimer. [Google Photos : supprimer sur ordinateur (consulté le 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Photos : restaurer sur ordinateur (consulté le 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**it** Ci dispiace che tu sia preoccupato per le tue foto. Solo se gli elementi sono ancora nel cestino e le regole attuali di Google Foto lo consentono. Apri il cestino di Google Foto, seleziona gli elementi e scegli Ripristina. Svuotare il cestino e qualsiasi eliminazione definitiva sono operazioni irreversibili. Se il cestino è pieno, potrebbe essere proposta invece l’eliminazione definitiva. Consulta le istruzioni di Google prima di eliminare. [Google Foto: eliminare dal computer (consultato il 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Foto: ripristinare dal computer (consultato il 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**nl** Het spijt ons dat je je zorgen maakt over je foto’s. Alleen als de items nog in de prullenbak staan en het huidige beleid van Google Foto’s dit toestaat. Open de prullenbak van Google Foto’s, selecteer de items en kies Herstellen. De prullenbak legen en elke definitieve verwijdering kunnen niet ongedaan worden gemaakt. Bij een volle prullenbak kan in plaats daarvan definitieve verwijdering worden aangeboden. Lees de instructies van Google voordat je verwijdert. [Google Foto’s: verwijderen op de computer (gecontroleerd op 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Foto’s: herstellen op de computer (gecontroleerd op 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**pt_BR** Sentimos que você esteja preocupado com suas fotos. Somente se os itens ainda estiverem na lixeira e a política atual do Google Fotos permitir. Abra a lixeira do Google Fotos, selecione os itens e escolha Restaurar. Esvaziar a lixeira e qualquer exclusão permanente não podem ser desfeitos. Se a lixeira estiver cheia, a exclusão permanente poderá ser oferecida em vez disso. Consulte as instruções do Google antes de excluir. [Google Fotos: excluir no computador (consultado em 2026-10-29)](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google Fotos: restaurar no computador (consultado em 2026-10-29)](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**zh_CN** 很抱歉让您担心照片。 只有内容仍在回收站中且符合 Google 相册当前政策时才可以恢复。打开 Google 相册回收站，选择所需内容，然后点击“恢复”。清空回收站和任何永久删除操作都无法撤销。回收站已满时，系统可能会改为提示永久删除。删除前请查看 Google 的说明。 [Google 相册电脑版删除说明（查阅日期：2026-10-29）](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google 相册电脑版恢复说明（查阅日期：2026-10-29）](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**zh_TW** 很抱歉讓您擔心照片。 只有內容仍在垃圾桶中且符合 Google 相簿目前政策時才可以復原。開啟 Google 相簿垃圾桶，選取所需內容，然後點選「還原」。清空垃圾桶和任何永久刪除操作都無法復原。垃圾桶已滿時，系統可能會改為提示永久刪除。刪除前請查看 Google 的說明。 [Google 相簿電腦版刪除說明（查閱日期：2026-10-29）](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google 相簿電腦版還原說明（查閱日期：2026-10-29）](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

**ja** 写真のことでご心配をおかけしました。 項目がゴミ箱に残っており、Google フォトの現在のポリシーで認められる場合だけです。Google フォトのゴミ箱を開き、項目を選択して「復元」を押してください。ゴミ箱を空にする操作や完全な削除は元に戻せません。ゴミ箱がいっぱいの場合、代わりに完全な削除を求められることがあります。削除前に Google の説明をご確認ください。 [Google フォトのパソコン向け削除手順（確認日：2026-10-29）](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop) · [Google フォトのパソコン向け復元手順（確認日：2026-10-29）](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)

## C. It's slow

Deletion runs at Google's UI pace, and the tool waits for Google to confirm
each batch ([README FAQ](../README.md#faq)). Do not promise a speed-up. Next
step: a smaller batch size, a narrower view (album or search), and the dry run
for the total and ETA.

**en** Thanks for the feedback. The tool waits for Google Photos to confirm each batch before it moves on, so it runs at Google's pace rather than racing ahead. A dry run first shows the total and an estimated time, and a smaller batch size or a narrower view (an album or search) can make a run easier to manage. If it seems stuck rather than slow, press "Report issue" and we'll look.

**de** Danke für die Rückmeldung. Das Tool wartet, bis Google Fotos jeden Stapel bestätigt hat, bevor es weitermacht, und läuft deshalb in Googles Tempo. Ein Probelauf zeigt vorab die Gesamtzahl und eine geschätzte Dauer; eine kleinere Stapelgröße oder eine engere Ansicht (Album oder Suche) macht einen Lauf handlicher. Wirkt es eher festgefahren als langsam, klicke auf "Problem melden", dann sehen wir nach.

**es** Gracias por el comentario. La herramienta espera a que Google Fotos confirme cada lote antes de continuar, por eso va al ritmo de Google. Una simulación previa muestra el total y un tiempo estimado, y un lote más pequeño o una vista más acotada (un álbum o una búsqueda) puede hacerlo más manejable. Si parece bloqueado más que lento, pulsa "Informar de un problema" y lo revisamos.

**fr** Merci pour votre retour. L'outil attend que Google Photos confirme chaque lot avant de continuer, il avance donc au rythme de Google. Une simulation préalable indique le total et une durée estimée, et un lot plus petit ou une vue plus ciblée (un album ou une recherche) peut faciliter l'opération. S'il semble bloqué plutôt que lent, cliquez sur "Signaler un problème" et nous regarderons.

**it** Grazie per il feedback. Lo strumento aspetta che Google Foto confermi ogni blocco prima di proseguire, quindi va al ritmo di Google. Una prova preliminare mostra il totale e un tempo stimato, e un blocco più piccolo o una vista più ristretta (un album o una ricerca) può rendere l'operazione più gestibile. Se sembra bloccato più che lento, premi "Segnala un problema" e controlliamo.

**nl** Bedankt voor je feedback. De tool wacht tot Google Foto's elke batch bevestigt voordat hij verdergaat, dus hij werkt op het tempo van Google. Een proefrun toont vooraf het totaal en een geschatte tijd, en een kleinere batchgrootte of een smallere weergave (een album of zoekopdracht) maakt een run beter hanteerbaar. Lijkt het vast te zitten in plaats van traag, druk dan op "Probleem melden" en we kijken mee.

**pt_BR** Obrigado pelo retorno. A ferramenta espera o Google Fotos confirmar cada lote antes de continuar, por isso segue o ritmo do Google. Uma simulação prévia mostra o total e um tempo estimado, e um lote menor ou uma visualização mais restrita (um álbum ou uma busca) pode deixar a execução mais fácil de acompanhar. Se parecer travado em vez de lento, clique em "Relatar problema" e vamos verificar.

**zh_CN** 感谢反馈。工具会等 Google 相册确认每一批之后才继续，所以速度取决于 Google 的页面响应。先做一次试运行可以看到总数和预计时间，调小每批数量或缩小范围（某个相册或搜索结果）也会更好控制。如果是卡住而不只是慢，请点击"报告问题"，我们来查看。

**zh_TW** 感謝回饋。工具會等 Google 相簿確認每一批之後才繼續，所以速度取決於 Google 的頁面回應。先做一次試跑可看到總數與預估時間，調小每批數量或縮小範圍（某個相簿或搜尋結果）也比較好掌控。若是卡住而不只是慢，請按「报告问题」，我們會查看。

**ja** ご意見ありがとうございます。このツールは Google フォトが各バッチを確認してから次へ進むため、Google の動作速度に合わせて動きます。事前のドライランで総数と目安の時間が分かり、バッチ数を減らす、またはアルバムや検索で範囲を絞ると扱いやすくなります。遅いのではなく止まっているように見える場合は、「問題を報告」を押してください。確認します。

## D. Pro questions and refunds

Facts to stay inside: deleting, dry run, duplicate finding and empty trash are
free forever; Pro adds filters, presets, keep rules, auto-accept and CSV export
([README Pro](../README.md#pro)). The token is pasted into the Pro license box
and verified on the device. Refunds: only under the stated policy, by email,
never decided or promised in the public thread. For anything account or order
specific, move it to email.

**en** Thanks for asking. Deleting, dry runs, finding duplicates and emptying Trash are free; Pro only adds extras such as filters, presets and CSV export. To activate Pro, paste your token into the "Pro license" box in the extension and press Activate. If Pro doesn't work as described and we can't fix it, email the support address in the README's Pro section and we'll put it right or refund you.

**de** Danke für die Frage. Löschen, Probelauf, Duplikatsuche und Papierkorb leeren sind kostenlos; Pro bringt nur Extras wie Filter, Voreinstellungen und CSV-Export. Zum Aktivieren füge deinen Token in das Feld "Pro-Lizenz" der Erweiterung ein und klicke auf Aktivieren. Funktioniert Pro nicht wie beschrieben und können wir es nicht beheben, schreibe an die Support-Adresse im Pro-Abschnitt der README, dann bringen wir es in Ordnung oder erstatten dir den Kaufpreis.

**es** Gracias por preguntar. Borrar, la simulación, buscar duplicados y vaciar la papelera son gratis; Pro solo añade extras como filtros, preajustes y exportación CSV. Para activarlo, pega tu token en el cuadro "Licencia Pro" de la extensión y pulsa Activar. Si Pro no funciona como se describe y no podemos solucionarlo, escribe a la dirección de soporte de la sección Pro del README y lo resolveremos o te reembolsaremos.

**fr** Merci pour votre question. Supprimer, la simulation, la recherche de doublons et le vidage de la corbeille sont gratuits ; Pro ajoute seulement des extras comme les filtres, les préréglages et l'export CSV. Pour l'activer, collez votre jeton dans la zone "Licence Pro" de l'extension et cliquez sur Activer. Si Pro ne fonctionne pas comme décrit et que nous ne pouvons pas le corriger, écrivez à l'adresse de support indiquée dans la section Pro du README et nous le règlerons ou vous rembourserons.

**it** Grazie della domanda. Eliminare, la prova preliminare, la ricerca dei duplicati e lo svuotamento del cestino sono gratuiti; Pro aggiunge solo extra come filtri, preset ed esportazione CSV. Per attivarlo, incolla il token nella casella "Licenza Pro" dell'estensione e premi Attiva. Se Pro non funziona come descritto e non riusciamo a risolvere, scrivi all'indirizzo di supporto nella sezione Pro del README e sistemeremo la cosa o ti rimborseremo.

**nl** Bedankt voor je vraag. Verwijderen, de proefrun, dubbelen zoeken en de prullenbak legen zijn gratis; Pro voegt alleen extra's toe zoals filters, voorinstellingen en CSV-export. Om te activeren plak je je token in het vak "Pro-licentie" in de extensie en druk je op Activeren. Werkt Pro niet zoals beschreven en kunnen we het niet oplossen, mail dan naar het supportadres in het Pro-gedeelte van de README, dan lossen we het op of betalen we terug.

**pt_BR** Obrigado por perguntar. Excluir, a simulação, a busca de duplicatas e esvaziar a lixeira são gratuitos; o Pro só adiciona extras como filtros, predefinições e exportação CSV. Para ativar, cole seu token na caixa "Licença Pro" da extensão e clique em Ativar. Se o Pro não funcionar como descrito e não conseguirmos resolver, escreva para o endereço de suporte na seção Pro do README e vamos corrigir ou reembolsar você.

**zh_CN** 感谢提问。删除、试运行、查找重复项和清空回收站都是免费的，Pro 只增加筛选、预设、CSV 导出等附加功能。激活方法：把令牌粘贴到扩展里的"Pro 许可证"框并点击激活。如果 Pro 与描述不符且我们无法解决，请发邮件到 README 的 Pro 部分列出的支持邮箱，我们会妥善处理或退款。

**zh_TW** 感謝提問。刪除、試跑、尋找重複項目與清空垃圾桶都是免費的，Pro 只增加篩選、預設組合、CSV 匯出等附加功能。啟用方式：把授權碼貼到擴充功能中的「Pro 授權」欄位並按啟用。若 Pro 與說明不符且我們無法解決，請寄信到 README 的 Pro 段落所列的支援信箱，我們會妥善處理或退款。

**ja** ご質問ありがとうございます。削除、ドライラン、重複検出、ゴミ箱を空にする機能は無料で、Pro はフィルター、プリセット、CSV エクスポートなどの追加機能のみです。有効化は、拡張機能の「Pro ライセンス」欄にトークンを貼り付けて「有効化」を押してください。Pro が説明どおりに動かず、こちらで解決できない場合は、README の Pro の項にあるサポート宛先へメールをください。対応または返金いたします。

## E. Feature requests

Say where it stands without promising it. Point to GitHub issues so the
request is tracked. Do not say "coming soon" or give a date. Boundaries from
[vision.md](vision.md#boundaries): no Google Photos API, no downloader, no
unattended scheduler, no other sites; a request outside them gets a polite
"not something this tool does".

**en** Thanks for the idea. Please open an issue on our GitHub page (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) describing what you'd like, so it's tracked and others can weigh in. We can't promise if or when it will be built, but every request gets read.

**de** Danke für die Idee. Bitte eröffne ein Issue auf unserer GitHub-Seite (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) und beschreibe, was du dir wünschst, damit es erfasst ist und andere mitdiskutieren können. Wir können nicht versprechen, ob oder wann es umgesetzt wird, aber jeder Wunsch wird gelesen.

**es** Gracias por la idea. Abre una incidencia en nuestra página de GitHub (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) describiendo lo que te gustaría, para que quede registrado y otros puedan opinar. No podemos prometer si se hará ni cuándo, pero leemos todas las peticiones.

**fr** Merci pour l'idée. Ouvrez un ticket sur notre page GitHub (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) en décrivant ce que vous souhaitez, afin qu'il soit suivi et que d'autres puissent y réagir. Nous ne pouvons pas promettre si ni quand ce sera réalisé, mais chaque demande est lue.

**it** Grazie per l'idea. Apri una segnalazione sulla nostra pagina GitHub (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) descrivendo ciò che vorresti, così viene tracciata e altri possono dire la loro. Non possiamo promettere se o quando verrà realizzata, ma leggiamo ogni richiesta.

**nl** Bedankt voor het idee. Open een issue op onze GitHub-pagina (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) en beschrijf wat je wilt, zodat het wordt bijgehouden en anderen kunnen meedenken. We kunnen niet beloven of en wanneer het komt, maar elk verzoek wordt gelezen.

**pt_BR** Obrigado pela ideia. Abra uma issue na nossa página do GitHub (github.com/SylphxAI/Google-Photos-Delete-Tool/issues) descrevendo o que você gostaria, para que fique registrado e outras pessoas possam opinar. Não podemos prometer se nem quando será feito, mas lemos todos os pedidos.

**zh_CN** 感谢您的建议。请在我们的 GitHub 页面（github.com/SylphxAI/Google-Photos-Delete-Tool/issues）提交 issue 描述您的想法，方便跟踪，也让其他人参与讨论。我们无法承诺是否或何时实现，但每条建议都会被阅读。

**zh_TW** 感謝您的建議。請到我們的 GitHub 頁面（github.com/SylphxAI/Google-Photos-Delete-Tool/issues）提交 issue 描述您的想法，方便追蹤，也讓其他人參與討論。我們無法承諾是否或何時實作，但每則建議都會被閱讀。

**ja** ご提案ありがとうございます。GitHub のページ（github.com/SylphxAI/Google-Photos-Delete-Tool/issues）に issue として内容を書いていただければ、記録され、他の方も意見を出せます。実装の有無や時期はお約束できませんが、すべてのご要望に目を通しています。

## F. 5-star thanks

Short. Thank them, and invite one next step that helps: nothing more. Do not
ask for changes to the rating or for a Pro purchase.

**en** Thank you, that's kind of you. We're glad it saved you time, and please stay safe: check the dry run before a real run. Feedback is always welcome via "Report issue".

**de** Vielen Dank, das freut uns. Schön, dass es dir Zeit gespart hat. Prüfe vor einem echten Lauf am besten den Probelauf. Rückmeldungen sind jederzeit über "Problem melden" willkommen.

**es** Muchas gracias, nos alegra mucho. Nos alegra que te ahorrara tiempo; antes de una ejecución real, revisa la simulación. Tus comentarios siempre son bienvenidos con "Informar de un problema".

**fr** Merci beaucoup, c'est très aimable. Nous sommes ravis que cela vous ait fait gagner du temps ; avant un vrai passage, consultez la simulation. Vos retours sont toujours les bienvenus via "Signaler un problème".

**it** Grazie mille, ci fa molto piacere. Siamo contenti che ti abbia fatto risparmiare tempo; prima di un'esecuzione reale controlla la prova preliminare. I tuoi commenti sono sempre benvenuti tramite "Segnala un problema".

**nl** Hartelijk dank, erg fijn. We zijn blij dat het je tijd bespaarde; controleer vóór een echte run de proefrun. Feedback is altijd welkom via "Probleem melden".

**pt_BR** Muito obrigado, ficamos felizes. Que bom que economizou seu tempo; antes de uma execução real, confira a simulação. Seu feedback é sempre bem-vindo em "Relatar problema".

**zh_CN** 非常感谢您的好评。很高兴它帮您节省了时间；正式运行前请先看一下试运行结果。欢迎随时通过"报告问题"反馈。

**zh_TW** 非常感謝您的好評。很高興它幫您節省了時間；正式執行前請先看一下試跑結果。歡迎隨時透過「报告问题」回饋。

**ja** 嬉しいお言葉をありがとうございます。お役に立てて何よりです。本番実行の前にはドライランの結果をご確認ください。ご意見は「問題を報告」からいつでもお寄せください。

## Can the store do this for us? No API

The Chrome Web Store has no API to list reviews or post replies. The
[Chrome Web Store API](https://developer.chrome.com/docs/webstore/api/reference/rest)
(v2) only has `media.upload` and `publishers.items` (`fetchStatus`, `publish`,
`cancelSubmission`, `setPublishedDeployPercentage`): publishing, no reviews. The
official guide to [managing user feedback](https://developer.chrome.com/docs/webstore/support-users)
says developers "can also post replies here" in the Reviews area of the item,
that users are not notified of a reply, and offers only email alerts: turn on
"Item review completed" under Notifications in the Developer Dashboard account
settings. It describes no API. Read on 2026-10-02; recheck if Google announces
one. Third-party scrapers of public reviews exist; they cannot reply, and we do
not use them (they may conflict with Google's terms).

So replies are manual, from the Developer Dashboard. Edge Add-ons and Firefox
AMO reviews are answered the same way in their own dashboards, with the same
templates.

## Weekly checklist

Owner: Spiron (holds the Chrome Web Store dashboard login); the OSS lane lead reviews the log weekly. One person owns the week; if
they are away, they hand it over by writing the next owner in the log.

1. Make sure "Item review completed" email alerts are on in the Developer
   Dashboard (once; recheck monthly).
2. Open the item's reviews page: the item URL with `/reviews` appended, or
   Developer Dashboard, item, Reviews. Sort newest first.
3. Find every review with no developer reply since the last log line. Include
   edited reviews: a changed rating may need a new reply.
4. Pick the template, reply in the reviewer's language, and add the one concrete
   next step. Keep any complaint that points to a real defect as a GitHub issue
   (label it, link nothing personal), and say so in the log.
5. Check Edge Add-ons and Firefox AMO the same way.
6. Add a line to the log: date, owner, new reviews, replied, still unanswered
   (should be 0), current rating and rating count.
7. If the rating is under 4.5 or a review is unanswered after the week, raise
   it to the lead the same day. Do not ask reviewers to change their rating.
8. Reviews that look fake or abusive cannot be deleted by us; report them
   through the One Support Form linked from the Chrome guide above.

### Log

| Week of | Owner | New | Replied | Unanswered | Rating (count) | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

/**
 * BLUNK Massive Natural Dry Human Quotes Collection (20+ Variations Per Day, Zero Emojis)
 */
(function() {
  const HOLIDAYS = {
    '01-01': 'Yılın ilk günü... Yılbaşı yorgunluğu sebebiyle kendisinden odak verisi alamıyoruz.',
    '04-23': '23 Nisan Çocuk Bayramı... Bugün ders masası yerine sokaklar ve dinlenme tercih edilmiş.',
    '05-01': '1 Mayıs İşçi Bayramı... Zihin bugün tam teşekküllü grevde.',
    '05-19': '19 Mayıs Gençlik Bayramı... Gençliğin tadını çıkarıyor, masada aramayın.',
    '07-15': '15 Temmuz Demokrasi Günü... Tatil modunda, odak seansı yok.',
    '08-30': '30 Ağustos Zafer Bayramı... Bayram coşkusu sebebiyle odak maratonuna ara verilmiş.',
    '10-29': '29 Ekim Cumhuriyet Bayramı... Bayram günü ders masasında oturulmaz.'
  };

  const FUTURE_QUOTES = [
    "Geleceğe gitmişsin ama gelecekte de çalışmadığı gerçeğiyle yüzleşiyorsun...",
    "Henüz yaşanmamış bir güne bakıyorsun, kahinliğe gerek yok...",
    "Gelecekten haber almak güzel ama takvim henüz buraya gelmedi...",
    "Zaman yolculuğunu biraz abarttık sanki, yarın bir gelsin bakalım...",
    "Gelecekteki benliği de şu an sen ne yapıyorsan onu yapıyor olabilir...",
    "Işınlanma icat oldu da bizim mi haberimiz yok...",
    "Henüz doğmamış bir günün odak verisini arıyorsun...",
    "Zamanın ötesine geçtin ama burada da bir hareket yok...",
    "Kehanet yapmaya gerek yok, günü gelince burada görürsün...",
    "Yarınlar bizim ama bugün henüz dün olmadı...",
    "Zaman makinesinden inip günümüze dönebilirsin...",
    "Gelecekteki odak performansını şimdiden merak etmek harika bir vizyon...",
    "O gün gelsin, söz ilk seansı sana haber vereceğiz...",
    "Takvimin sınırlarını zorlama, henüz o güne uyanmadık...",
    "Gelecekte ders çalışıp çalışmayacağını görmek için zamanı beklemelisin...",
    "Zamanın ilerisine atladın ama sayfa boş...",
    "Gelecek henüz yazılmadı, o yüzden burada veri yok...",
    "İlerideki bir tarihi seçmek yerine bugüne odaklansan nasıl olur...",
    "Zaman ışık hızında aksa da bu tarihe henüz ulaşamadık...",
    "Takvimde aşırı ileri gittin, biraz geriye yaklaş..."
  ];

  const DAY_SPECIFIC_QUOTES = {
    'Pazartesi': [
      "Pazartesi sendromundan dolayı ulaşamadık kendisine...",
      "Haftaya hızlı başlayacaktı ama Pazartesi şoku ağır gelmiş...",
      "Pazartesi günü kahveyi fazla kaçırıp masaya oturamayanlar kulübü...",
      "Pazartesi motivasyonu öğlene doğru buharlaşmış görünüyor...",
      "Pazartesinin ciddiyetine adapte olmaya çalışırken gün bitmiş...",
      "Haftanın ilk gününde zihin henüz uyanış evresini geçememiş...",
      "Pazartesiye büyük hedeflerle girip masadan erken kalkanlar...",
      "Hafta başı stresi masanın etrafında dolanıp içeri girmesini engellemiş...",
      "Pazartesi günü odaklanmak yerine hafta sonunun yasını tutmuş...",
      "İlk günden pes etmek yoktu ama Pazartesi sürprizi işte...",
      "Pazartesi alarmsız uyanıp masa başını es geçenler günü...",
      "Haftanın başlangıcında rolantide takılmayı seçmiş...",
      "Pazartesi günü işler yoğun derken ders masası unutulmuş...",
      "Pazartesi sendromunu atlatıp masaya oturması Salıyı bulacak...",
      "İlk günden rekora koşacaktı ama Pazartesi engeline takıldı...",
      "Pazartesi motivasyonu sadece niyet aşamasında kalmış...",
      "Haftanın ilk günü dinlenme hakkını kullanmış görünüyor...",
      "Pazartesi günü odak modu devreye giremeden gün sona ermiş...",
      "Pazartesi disiplini dedikleri şey bu gün pek uğramamış...",
      "Pazartesi günü masada olmama mazereti kabul edilmiştir..."
    ],
    'Salı': [
      "Salı gününün klasliği altında ezilmiş, masaya geçememiş...",
      "Pazartesinin yorgunluğu Salı gününe sarkmış görünüyor...",
      "Salı sallanır dediler, gerçekten de odak sallantıda kalmış...",
      "Haftanın ikinci gününde de rolanti modunda devam ediliyor...",
      "Salı günü sakinliği masaya oturmaya engel olmuş...",
      "Pazartesiyi atlattık derken Salı durgunluğu vurmuş...",
      "Salı günü vites yükseltmek yerine tamamen boşa almış...",
      "Haftanın en belirsiz günü Salı, odak da belirsiz kalmış...",
      "Salı günü yapılacak işler listesi başka bahara kalmış...",
      "Salı gününü sessiz pas geçenler arasına katılmış...",
      "Masa başı yapmak yerine Salı yürüyüşünü tercih etmiş...",
      "Salı günü temposu düşük kalmış, odak seansı yok...",
      "Pazartesi yorgunluğunu Salı günü dinlenerek çıkartıyor...",
      "Salı gününde bir hareketlenme bekleniyordu ama tıs çıktı...",
      "Salı günü ders çalışmak yerine zihni nadasa bırakmış...",
      "Salı motivasyonu henüz yükleme aşamasında kalmış...",
      "Haftanın ortasına yaklaşırken Salı gününü es geçmiş...",
      "Salı günü için verilen sözler bir sonraki Salıya kalmış...",
      "Salı günü masaya yaklaşmış ama oturmaya cesaret edememiş...",
      "Salı gününün ritmine ayak uyduramayıp dinlenmeye çekilmiş..."
    ],
    'Çarşamba': [
      "Çarşamba günü rolantiye çekmiş, hafta ortası durgunluğu...",
      "Haftayı yarıladı diye her şeyi salmış durumda...",
      "Çarşamba günü denge günüdür. Ne çok çalışıldı ne çok yatıldı... Yani hiç çalışılmadı!",
      "Hafta ortası krizini masadan uzaklaşarak çözmeyi denemiş...",
      "Çarşamba günü tepesi aşıldı, vites boşa sallandı...",
      "Çarşamba günü motivasyonu hafta sonu hayallerine kurban gitmiş...",
      "Haftanın tam ortasında mola vermek en doğal hakkı...",
      "Çarşamba günü temposunu koruyamayıp dinlenmeye geçmiş...",
      "Çarşambayı sel aldı, odak seansları geride kaldı...",
      "Hafta ortasında bataryayı şarj etmeye karar vermiş...",
      "Çarşamba günü masa başında olmak yerine kahve yudumlamış...",
      "Haftanın bel kemiği Çarşamba günü kırılmış görünüyor...",
      "Çarşamba günü zihinsel mola günü olarak ilan edilmiş...",
      "Haftayı yarılamanın getirdiği rahatlıkla masayı kapatmış...",
      "Çarşamba günü yoğunluğu bahane edilip seans açılmamış...",
      "Hafta ortası molası biraz uzun sürmüş gibi duruyor...",
      "Çarşamba günü ders çalışmak yerine gelecek planları yapılmış...",
      "Çarşamba gününün ortasında odak enerjisi tükenmiş...",
      "Hafta ortası durgunluğu Çarşambayı es geçmesine neden olmuş...",
      "Çarşamba gününü pas geçip Perşembeye göz dikmiş..."
    ],
    'Perşembe': [
      "Cuma geliyor diye perşembeden salanlar kervanı...",
      "Hafta sonu kokusunu alıp masayı terk etmiş...",
      "Perşembe akşamı kaçamağı derken odak seansı yalan olmuş...",
      "Cuma'nın gelişi Perşembe'den bellidir, zihin tatilde...",
      "Hafta sonuna ramak kala Perşembe gününü feda etmiş...",
      "Perşembe günü vites düşürüp rölantide ilerlemiş...",
      "Haftanın son kulvarına girerken Perşembe molası verilmiş...",
      "Perşembe günü masaya oturmak yerine hafta sonunu planlamış...",
      "Cuma gecesi moduna Perşembeden giriş yapılmış...",
      "Perşembe günü enerjisi hafta sonu hayallerine harcanmış...",
      "Haftanın dördüncü gününde masada olmak zor gelmiş...",
      "Perşembe yorgunluğu ders çalışma isteğini bastırmış...",
      "Perşembe günü odak seansı açmak yerine dinlenmeyi seçmiş...",
      "Cuma öncesi son virajda Perşembeyi pas geçmiş...",
      "Perşembe günü motivasyonu hafta sonu beklentisine yenik düşmüş...",
      "Perşembe günü zihin çoktan hafta sonu moduna geçmiş...",
      "Perşembeyi atlatıp Cumaya kapak atma derdinde...",
      "Perşembe günü masadaki kitaplar kapağı kapalı beklemiş...",
      "Hafta bitiyor rahatlığıyla Perşembeyi es geçmiş...",
      "Perşembe gününün temposu masaya yansımamış..."
    ],
    'Cuma': [
      "Cuma akşamı dışarıda hayat var, kendisini burada aramayın...",
      "Cuma moduna çoktan girilmiş, masa tatile çıkarılmış...",
      "Cuma günü kimse masa başında duramaz, akşam planları yapıldı...",
      "Haftanın son iş gününde vites tamamen boşa alınmış...",
      "Cuma akşamı kapıyı kapatıp odak modunu kapatmış...",
      "Cuma enerjisi ders masasına değil sosyal hayata aktarılmış...",
      "Haftayı bitirmenin haklı gururuyla masayı terk etmiş...",
      "Cuma günü çalışma isteği yerini hafta sonu neşesine bırakmış...",
      "Cuma akşamı kahvesi masada değil dışarıda içilmiş...",
      "Cuma günü odaklanmak doğaya aykırı bulunmuş...",
      "Hafta sonu kapıdayken Cuma gününü çalışarak harcamamış...",
      "Cuma günü zihinsel kepenkler çoktan indirilmiş...",
      "Cuma akşamı kütüphanede kalmak yerine kaçış planlanmış...",
      "Haftanın son gününde masaya uğramadan tatile geçilmiş...",
      "Cuma günü odak seansı açmak yerine dostlarla vakit geçirilmiş...",
      "Cuma gecesi ders çalışmak fikri hızla reddedilmiş...",
      "Cuma günü yorgunluğu masaya oturmaya izin vermemiş...",
      "Cuma gününü pas geçip hafta sonuna temiz bir başlangıç hedeflenmiş...",
      "Cuma akşamı odak maratonu yerine dinlenme maratonu başlamış...",
      "Cuma günü masada olmama hakkı sonuna kadar kullanılmış..."
    ],
    'Cumartesi': [
      "Cumartesi gecesi çalışan insan sayısı bir elin parmaklarını geçmez...",
      "Ne de olsa Cumartesi günü canım, gezmek varken kütüphanede mi yatacak...",
      "Cumartesi gününü de çalışarak geçirecek değildi ya...",
      "Cumartesi gecesi hayat dışarıda, odak burada aranmaz...",
      "Hafta sonunun ilk gününü tamamen kendine ayırmış...",
      "Cumartesi günü masa başı yapmak yerine özgürlüğün tadını çıkarmış...",
      "Cumartesi günü dizi & film maratonu derken odak unutulmuş...",
      "Cumartesi günü oyun gecesi var, ders masası kapalı...",
      "Cumartesi günü kafa dinleme günü, odak sonra da yapılır...",
      "Cumartesi gününü çalışmadan geçirmek en doğal insan hakkıdır...",
      "Cumartesi akşamı masaya oturmak yerine dostlarla buluşulmuş...",
      "Cumartesi günü dinlenme hakkı tepe tepe kullanılmış...",
      "Cumartesi günü zihni tamamen boşaltma günü ilan edilmiş...",
      "Cumartesi günü odaklanmak yerine hayata odaklanılmış...",
      "Cumartesi gününün tadı masada değil dışarıda çıkar...",
      "Cumartesi günü kitap kapakları açılmadan kapanmış...",
      "Cumartesi gecesi maratonu için enerji depolanmış...",
      "Cumartesi günü ders çalışmama kuralı bozulmamış...",
      "Cumartesi günü masayı pas geçip sokaklara akmış...",
      "Cumartesi günü odak seansı yerini keyif seansına bırakmış..."
    ],
    'Pazar': [
      "Pazar günü kahvaltı masasında kaldı sanırız...",
      "Pazar yatışı kutsaldır, odak modunu sorgulamayın...",
      "Pazar akşamı stresi sarmış ama icraat sıfır kalmış...",
      "Pazar günü uzun kahvaltılar ve çay seansları ile geçmiş...",
      "Pazar gününü tamamen dinlenmeye ve yenilenmeye ayırmış...",
      "Pazar günü masa başında oturmak yerine aileyle vakit geçirilmiş...",
      "Pazar akşamı 'yarın Pazartesi' stresiyle masaya yanaşılamamış...",
      "Pazar gününün huzuru ders çalışma stresiyle bozulmamış...",
      "Pazar günü yataktan geç çıkıp günü nadasa bırakmış...",
      "Pazar günü şarj olma günü, odak motorları kapatılmış...",
      "Pazar günü zihni boşaltıp yeni haftaya hazırlık yapılmış...",
      "Pazar gününü dersle değil keyifle geçirmeyi seçmiş...",
      "Pazar akşamı ödevi son dakikaya bırakıp yine de yapmayanlar...",
      "Pazar günü doğa yürüyüşü ve temiz hava dersin önüne geçmiş...",
      "Pazar gününün dinginliği masa başı temposunu kaldırmamış...",
      "Pazar günü odak seansı yerine dinlenme seansı yazılmış...",
      "Pazar gününü rölantide geçirip motivasyon depolamış...",
      "Pazar günü kitap sayfaları yerine gazete/dergi karıştırılmış...",
      "Pazar gecesi erken yatıp haftaya dinç girmek hedeflenmiş...",
      "Pazar günü masada olmama mazereti oy birliğiyle kabul edilmiştir..."
    ]
  };

  const GENERAL_EMPTY_QUOTES = [
    "Bu gün tam anlamıyla nadasa bırakılmış...",
    "Kendi halinde takıldığı bir gün, odak aramaya gerek yok...",
    "Sessiz sakin geçmiş bir gün, veri yok...",
    "Bugün zihin dinlendirme günü ilan edilmiş...",
    "Şampiyon bugün yatışta, masa başında durmamış...",
    "Bu günün ajandasında odak seansı yer almamış...",
    "Zihinsel mola günü, masaya uğranmamış...",
    "Bugün tamamen serbest zaman olarak değerlendirilmiş...",
    "Odak verisi yok ama yaşanmışlık kesinlikle var...",
    "Masa başı yapmak yerine hayatın tadı çıkarılmış...",
    "Bu günün bilançosu: Sıfır dakika odak, bolca dinlenme...",
    "Bataryaları doldurma günü, masaya ara verilmiş...",
    "Zihin bugün izinli, saatler boşa akmış...",
    "Bugün odak seansı açılmamış ama olsun, yarın var...",
    "Masadaki sandalye bugün boş kalmayı tercih etmiş...",
    "Bugün için kaydedilmiş bir seans bulunmuyor...",
    "Odak kayıtları bugün için tamamen temiz...",
    "Bu gün masa başı temposundan uzak durulmuş...",
    "Zihni dinlendirmek de bir stratejidir...",
    "Bu gün için odak göstergeleri sıfırı işaret ediyor..."
  ];

  function getDeterministicIndex(seedStr, listLength) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % listLength;
  }

  function getFunnyEmptyDayQuote(dateStr, dayName, userId) {
    if (!dateStr) return "Bu gün kaydedilmiş bir odak seansı bulunmuyor.";

    const seed = `${dateStr}_${userId || 'blunk'}`;
    const todayStr = new Date().toISOString().split('T')[0];

    if (dateStr > todayStr) {
      const idx = getDeterministicIndex(seed, FUTURE_QUOTES.length);
      return FUTURE_QUOTES[idx];
    }

    const monthDay = dateStr.substring(5);
    if (HOLIDAYS[monthDay]) {
      return HOLIDAYS[monthDay];
    }

    if (dayName && DAY_SPECIFIC_QUOTES[dayName]) {
      const quotes = DAY_SPECIFIC_QUOTES[dayName];
      const idx = getDeterministicIndex(seed, quotes.length);
      return quotes[idx];
    }

    const idx = getDeterministicIndex(seed, GENERAL_EMPTY_QUOTES.length);
    return GENERAL_EMPTY_QUOTES[idx];
  }

  window.getFunnyEmptyDayQuote = getFunnyEmptyDayQuote;
})();

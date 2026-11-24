export type SampleOrder = {
  order_id: string;
  marketplace: string;
  sku: string;
  customer_name: string;
  purchase_offset: number;
  carrier: string;
  tracking_no: string;
  shipping_status: string;
  delivery_offset: number;
};

export const SAMPLE_ORDERS: SampleOrder[] = [
  { order_id: "113-4829301-5521847", marketplace: "US", sku: "HK-BOT-001", customer_name: "Emily Carter", purchase_offset: -6, carrier: "UPS", tracking_no: "1Z9A84W70392718840", shipping_status: "运输中", delivery_offset: 2 },
  { order_id: "302-1188420-6634019", marketplace: "DE", sku: "SP-YOG-008", customer_name: "Thomas Becker", purchase_offset: -8, carrier: "DHL", tracking_no: "00340434161094042557", shipping_status: "延误", delivery_offset: -1 },
  { order_id: "113-6604127-2290385", marketplace: "US", sku: "EL-CHG-005", customer_name: "Daniel Kim", purchase_offset: -12, carrier: "Amazon Logistics", tracking_no: "TBA304918227000", shipping_status: "已签收", delivery_offset: -9 },
  { order_id: "171-5530218-9902714", marketplace: "FR", sku: "HK-ORG-002", customer_name: "Camille Laurent", purchase_offset: -15, carrier: "Colissimo", tracking_no: "6A21548830215", shipping_status: "已签收", delivery_offset: -10 },
  { order_id: "113-2203984-7716420", marketplace: "US", sku: "OD-CMP-004", customer_name: "Michael Brown", purchase_offset: -9, carrier: "USPS", tracking_no: "9400111899223847712045", shipping_status: "已签收", delivery_offset: -4 },
  { order_id: "404-2291847-3318560", marketplace: "IT", sku: "EL-CHG-005", customer_name: "Giulia Rossi", purchase_offset: -5, carrier: "Poste Italiane", tracking_no: "RR184402291IT", shipping_status: "运输中", delivery_offset: 3 },
  { order_id: "406-8830271-5527301", marketplace: "ES", sku: "HK-LMP-014", customer_name: "Lucía Fernández", purchase_offset: -14, carrier: "Correos", tracking_no: "PQ47CX0412870180128001B", shipping_status: "已签收", delivery_offset: -8 },
  { order_id: "205-3318024-4471182", marketplace: "UK", sku: "HG-HTR-011", customer_name: "Oliver Smith", purchase_offset: -7, carrier: "Royal Mail", tracking_no: "JD014600003828337019", shipping_status: "已签收", delivery_offset: -3 },
  { order_id: "113-7720154-0083216", marketplace: "US", sku: "PT-FDR-013", customer_name: "Jessica Moore", purchase_offset: -10, carrier: "Amazon Logistics", tracking_no: "TBA305522184000", shipping_status: "已签收", delivery_offset: -2 },
  { order_id: "113-9031846-6620174", marketplace: "US", sku: "EL-CBL-006", customer_name: "Ryan Wilson", purchase_offset: -3, carrier: "USPS", tracking_no: "9400111899223850034417", shipping_status: "派送中", delivery_offset: 0 },
  { order_id: "302-4471902-1180623", marketplace: "DE", sku: "HK-BOT-001", customer_name: "Anna Schmidt", purchase_offset: -4, carrier: "DPD", tracking_no: "01505021894710", shipping_status: "运输中", delivery_offset: 2 },
  { order_id: "205-6620183-9914027", marketplace: "UK", sku: "PT-BED-003", customer_name: "Harry Jones", purchase_offset: -6, carrier: "Evri", tracking_no: "H01HYA0039284721", shipping_status: "运输中", delivery_offset: 1 },
];

export type SampleTicket = {
  channel: string;
  marketplace: string;
  order_id: string | null;
  customer_name: string;
  customer_email: string;
  subject: string;
  body: string;
  translation_zh: string;
  hours_ago: number;
};

export const SAMPLE_TICKETS: SampleTicket[] = [
  {
    channel: "Amazon 买家消息",
    marketplace: "US",
    order_id: "113-4829301-5521847",
    customer_name: "Emily Carter",
    customer_email: "emily.c@marketplace.amazon.com",
    subject: "When will my order arrive?",
    body: "Hi, I ordered the stainless steel water bottle last week (order 113-4829301-5521847). Could you tell me when it will arrive? Thanks, Emily",
    translation_zh: "你好，我上周买了不锈钢保温杯（订单 113-4829301-5521847），请问什么时候能到？谢谢，Emily",
    hours_ago: 3,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "DE",
    order_id: "302-1188420-6634019",
    customer_name: "Thomas Becker",
    customer_email: "thomas.b@marketplace.amazon.de",
    subject: "Lieferung verspätet",
    body: "Hallo, meine Bestellung 302-1188420-6634019 sollte schon gestern ankommen, aber die Sendungsverfolgung zeigt seit drei Tagen keine Bewegung. Können Sie bitte nachsehen? Mit freundlichen Grüßen, Thomas Becker",
    translation_zh: "你好，我的订单 302-1188420-6634019 本应昨天送达，但物流追踪已经三天没有更新了。能帮忙查一下吗？此致，Thomas Becker",
    hours_ago: 5,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "US",
    order_id: null,
    customer_name: "Kevin Liu",
    customer_email: "kevin.l@marketplace.amazon.com",
    subject: "Question about the 65W charger",
    body: "Hello, can I charge my MacBook Air and my phone at the same time with the 65W charger? Will the laptop charge slower?",
    translation_zh: "你好，65W 充电器能同时给我的 MacBook Air 和手机充电吗？笔记本会充得更慢吗？",
    hours_ago: 6,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "FR",
    order_id: "171-5530218-9902714",
    customer_name: "Camille Laurent",
    customer_email: "camille.l@marketplace.amazon.fr",
    subject: "Retour de la boîte de rangement",
    body: "Bonjour, la boîte de rangement est plus petite que prévu. Je souhaite la retourner et être remboursée. Commande 171-5530218-9902714. Merci.",
    translation_zh: "你好，收纳箱比预期的小，我想退货并退款。订单 171-5530218-9902714。谢谢。",
    hours_ago: 8,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "US",
    order_id: "113-2203984-7716420",
    customer_name: "Michael Brown",
    customer_email: "michael.b@marketplace.amazon.com",
    subject: "Lantern broken!!!",
    body: "The camping lantern stopped working after 2 days!!! This is unacceptable. I want a full refund now or I'm leaving a 1-star review and filing an A-to-Z claim.",
    translation_zh: "露营灯用了两天就坏了！！！这不可接受。我要求立即全额退款，否则我会给一星差评并提起 A-to-Z 索赔。",
    hours_ago: 2,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "IT",
    order_id: "404-2291847-3318560",
    customer_name: "Giulia Rossi",
    customer_email: "giulia.r@marketplace.amazon.it",
    subject: "Dov'è il mio ordine?",
    body: "Buongiorno, dov'è il mio ordine 404-2291847-3318560? Non ho ricevuto nessun aggiornamento sulla spedizione. Grazie, Giulia",
    translation_zh: "你好，我的订单 404-2291847-3318560 到哪了？我没有收到任何物流更新。谢谢，Giulia",
    hours_ago: 10,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "ES",
    order_id: "406-8830271-5527301",
    customer_name: "Lucía Fernández",
    customer_email: "lucia.f@marketplace.amazon.es",
    subject: "Tira LED",
    body: "Hola, ¿se puede cortar la tira LED a medida? ¿Y cómo se limpia? Gracias.",
    translation_zh: "你好，LED 灯带可以按需要剪短吗？怎么清洁？谢谢。",
    hours_ago: 12,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "UK",
    order_id: "205-3318024-4471182",
    customer_name: "Oliver Smith",
    customer_email: "oliver.s@marketplace.amazon.co.uk",
    subject: "Hand warmer heating unevenly",
    body: "Hi, the hand warmer arrived but one side gets much hotter than the other and it is quite uncomfortable. Is it defective? A bit disappointed to be honest.",
    translation_zh: "你好，暖手宝收到了，但一边比另一边热很多，用起来挺不舒服的。是不是有质量问题？说实话有点失望。",
    hours_ago: 14,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "DE",
    order_id: null,
    customer_name: "Lena Wagner",
    customer_email: "lena.w@marketplace.amazon.de",
    subject: "Frage zur Yogamatte",
    body: "Hallo, ist die Yogamatte auch bei Hot Yoga rutschfest? Und wie reinige ich sie am besten? Danke!",
    translation_zh: "你好，这款瑜伽垫在高温瑜伽时也防滑吗？最好怎么清洁？谢谢！",
    hours_ago: 18,
  },
  {
    channel: "邮件",
    marketplace: "US",
    order_id: null,
    customer_name: "Sarah Johnson",
    customer_email: "sarah@pawsandco-example.com",
    subject: "Wholesale inquiry",
    body: "Hi there, we run a small chain of pet stores and are interested in your pet cooling mat. Do you offer wholesale pricing for around 200 units?",
    translation_zh: "你好，我们经营一个小型宠物店连锁，对你们的宠物冷感垫感兴趣。大约 200 件的话有批发价吗？",
    hours_ago: 26,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "US",
    order_id: "113-7720154-0083216",
    customer_name: "Jessica Moore",
    customer_email: "jessica.m@marketplace.amazon.com",
    subject: "Package not received",
    body: "Hi, the tracking says my automatic pet feeder was delivered two days ago but I never got the package. Order 113-7720154-0083216. Can you help?",
    translation_zh: "你好，物流显示我的自动喂食器两天前已经送达，但我根本没收到包裹。订单 113-7720154-0083216。能帮忙处理吗？",
    hours_ago: 4,
  },
  {
    channel: "Amazon 买家消息",
    marketplace: "US",
    order_id: "113-9031846-6620174",
    customer_name: "Ryan Wilson",
    customer_email: "ryan.w@marketplace.amazon.com",
    subject: "Tracking update?",
    body: "Hey, just checking the status of my USB-C cables, order 113-9031846-6620174. Is it arriving today?",
    translation_zh: "你好，想确认一下我的 USB-C 数据线的物流状态，订单 113-9031846-6620174。今天能到吗？",
    hours_ago: 1,
  },
];

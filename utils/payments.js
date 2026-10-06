// ─── ÖDEME ALTYAPISI (entegrasyona hazır) ──────────────────────────────────
//
// ⚠️  ÖNEMLİ — YASAL NOT:
// Bu modül, ödeme sağlayıcısına bağlanmak için hazırlanmış bir DIKİŞ (seam)'tir.
// Canlı tahsilat için şunlar gerekir ve BUNLAR OLMADAN CANLI ÖDEME AÇILMAZ:
//   • Türkiye'de reşit olmak (18+) VEYA kanuni temsilcinin (veli) onayı —
//     iyzico/PayTR hesap açılışı yetişkin kimliği + vergi bilgisi ister.
//   • Vergi mükellefiyeti (şahıs firması veya veli üzerinden) + KDV (%20)
//     + gelir vergisi + Bağ-Kur yükümlülüğü.
// Bu modül PAYMENT_PROVIDER ile yapılandırılmadığı sürece MANUEL modu döndürür
// (mevcut /api/select-package + /siparis-onayla akışı kullanılır).
//
// HANGİ SAĞLAYICI: iyzico (Türkiye) veya PayTR (IFrame) en yaygın.
// Aşağıdaki TODO bloğuna ilgili sağlayıcının SDK/webhook çağrısı eklenir.

const fs = require('fs');
const crypto = require('crypto');

/**
 * Ödeme modunu döndürür: 'manual' (varsayılan) veya yapılandırılmış sağlayıcı adı.
 */
function getPaymentMode() {
  const provider = (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (!provider) return 'manual';
  // Bilinen sağlayıcılar; henüz canlı kod bağlanmadıysa yine 'manual' gibi davran
  if (['iyzico', 'paytr'].includes(provider)) return provider;
  return 'manual';
}

/**
 * Ödeme oturumu başlatır. Şu an manuel akışa yönlendirir; sağlayıcı bağlandığında
 * burada ödeme sayfası/token'ı üretilecek ve dönen `redirectUrl` kullanılacak.
 *
 * @param {object} order   recordWebOrder ile oluşturulmuş sipariş
 * @param {object} pkg     PACKAGES'tan paket
 * @param {object} user    web kullanıcısı (getWebUser sonucu)
 */
async function createPaymentSession(order, pkg, user) {
  const mode = getPaymentMode();

  if (mode === 'manual') {
    return {
      ok: true,
      mode: 'manual',
      message: 'Online ödeme henüz aktif değil. Ödemeyi belirtilen hesaba havale/EFT yapıp sipariş noyu ile onaylat.',
    };
  }

  // ─── TODO: Gerçek sağlayıcı bağlantısı buraya ─────────────────────────────
  // İyzico örneği (kişisel/şahıs firması hesabı gerekir):
  //   const iyzipay = require('iyzipay');
  //   iyzipay.checkoutFormInitialize.create({ ... }, cb)
  // PayTR örneği:
  //   const payload = { merchant_id, user_ip, merchant_oid: order.id, email,
  //     payment_amount: pkg.priceMonthly*100, merchant_ok_url, merchant_fail_url,
  //     user_name, user_phone, ... , paytr_token };
  //   hash = base64(sha256(merchant_salt + merchant_key + paytr_token))
  // Bağlandıktan sonra: mode !== 'manual' iken webhook'u işleyip
  // setOrderStatus(order.id, 'onaylandı') çağır + kullanıcıya bildir.
  // ──────────────────────────────────────────────────────────────────────────
  return {
    ok: false,
    mode,
    message: `${mode} entegrasyonu henüz bağlanmadı (sağlayıcı hesabı + kod gerekiyor).`,
  };
}

/**
 * Ödeme webhook imzasını doğrular (sağlayıcıya göre değişir).
 * Sağlayıcı bağlanana dek false döner.
 */
function verifyWebhookSignature(provider, rawBody, headers) {
  if (!provider || !['iyzico', 'paytr'].includes(provider)) return false;
  const salt = process.env.PAYTR_MERCHANT_SALT || '';
  const key = process.env.PAYTR_MERCHANT_KEY || '';
  if (provider === 'paytr' && salt && key) {
    // TODO: PayTR webhook doğrulama formülü — sağlayıcı dokümanındaki alan
    // sırasına göre doldurulmalı. Yanlış formül ödemeleri kırar, dikkatle test et.
    return false; // güvenli davranış: doğrulanamayan imza kabul edilmez
  }
  return false;
}

module.exports = { getPaymentMode, createPaymentSession, verifyWebhookSignature };

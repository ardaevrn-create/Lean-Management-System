// Vercel fonksiyonu: derlenmiş Nest uygulamasını (dist) çalıştırır. Tüm istekler vercel.json ile buraya yönlenir.
module.exports = require('../dist/serverless.js').default;

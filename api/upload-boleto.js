const FormData = require('form-data');
const crypto = require('crypto');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serial, cnpj } = req.body;

  const cloudName = 'dvly2ldys';
  const apiKey = '972741416413585';
  const apiSecret = 'R_MuqTFp0T8uTO28IeorOuqRF7I';
  const uploadPreset = 'boleto_api'; // NOME DO PRESET QUE VOCÊ CRIOU

  if (!serial || !cnpj) {
    return res.status(400).json({ 
      error: 'Serial e CNPJ são obrigatórios'
    });
  }

  try {
    // 1. Renovar token
    console.log('🔐 Obtendo novo token...');
    const loginResponse = await fetch(
      'http://navarrocloud.ramo.com.br/filesV2/api/Login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userName: 'gobot',
          password: 'I73f6#20d@L46'
        })
      }
    );

    if (!loginResponse.ok) {
      throw new Error('Erro ao obter token: ' + loginResponse.status);
    }

    const responseText = await loginResponse.text();
    let bearerToken = responseText.trim().replace(/^"|"$/g, '');

    console.log('✅ Token obtido');

    // 2. Buscar PDF
    console.log('📄 Buscando PDF...');
    const boletoPdf = await fetch(
      `http://navarrocloud.ramo.com.br/files/api/Boleto?serial=${serial}&cnpj=${cnpj}`,
      {
        headers: {
          'Authorization': 'Bearer ' + bearerToken
        }
      }
    );

    if (!boletoPdf.ok) {
      throw new Error('Erro ao buscar boleto: ' + boletoPdf.status);
    }

    const buffer = Buffer.from(await boletoPdf.arrayBuffer());
    console.log('✅ PDF baixado:', buffer.length, 'bytes');

    // 3. Base64
    const base64 = buffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64}`;

    // 4. Assinatura COM upload_preset
    const timestamp = Math.round(Date.now() / 1000);
    
    // String para assinar em ordem alfabética
    const toSign = `timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    console.log('🔐 Upload Preset:', uploadPreset);
    console.log('🔐 Timestamp:', timestamp);
    console.log('🔐 String to sign:', toSign.substring(0, 50) + '...');
    console.log('🔐 Signature:', signature);

    // 5. Upload COM upload_preset
    const formData = new FormData();
    formData.append('file', dataUri);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('upload_preset', uploadPreset);
    formData.append('signature', signature);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      }
    );

    const result = await cloudinaryResponse.json();
    console.log('📡 Status:', cloudinaryResponse.status);
    console.log('📡 Response:', JSON.stringify(result));

    if (result.secure_url) {
      console.log('✅ Sucesso! URL:', result.secure_url);
      return res.status(200).json({ 
        success: true,
        url: result.secure_url 
      });
    }

    throw new Error(JSON.stringify(result));

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

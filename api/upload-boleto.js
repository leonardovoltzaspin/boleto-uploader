const cloudinary = require('cloudinary').v2;

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

  const { serial, cnpj, cloudName, apiKey, apiSecret } = req.body;

  if (!serial || !cnpj || !cloudName || !apiKey || !apiSecret) {
    return res.status(400).json({ 
      error: 'Parâmetros faltando'
    });
  }

  try {
    // Configurar Cloudinary
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

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
    let bearerToken;
    
    try {
      const loginResult = JSON.parse(responseText);
      bearerToken = loginResult.token || loginResult.accessToken || loginResult.access_token || loginResult;
    } catch (e) {
      bearerToken = responseText.trim().replace(/^"|"$/g, '');
    }
    
    if (!bearerToken || bearerToken.length < 10) {
      throw new Error('Token inválido');
    }

    console.log('✅ Token obtido');

    // 2. Buscar PDF
    console.log('📄 Buscando PDF do boleto...');
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

    const arrayBuffer = await boletoPdf.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('✅ PDF baixado:', buffer.length, 'bytes');

    // 3. Upload usando biblioteca oficial
    console.log('☁️ Fazendo upload para Cloudinary...');
    
    const base64File = buffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64File}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'raw',
      public_id: `boleto_${serial}`,
      format: 'pdf'
    });

    console.log('✅ Upload bem-sucedido! URL:', uploadResult.secure_url);
    
    return res.status(200).json({ 
      success: true,
      url: uploadResult.secure_url 
    });

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

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

  const { serial, cnpj, cloudName, apiKey, apiSecret } = req.body;

  if (!serial || !cnpj || !cloudName || !apiKey || !apiSecret) {
    return res.status(400).json({ 
      error: 'Parâmetros faltando'
    });
  }

  try {
    // 1. Renovar token automaticamente
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
      throw new Error('Token inválido recebido: ' + bearerToken);
    }

    console.log('✅ Token obtido');

    // 2. Busca o PDF do boleto
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

    // 3. Criar assinatura para upload autenticado
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `boleto_${serial}`;
    
    // Parâmetros que vão na assinatura (ordem alfabética)
    const paramsToSign = {
      public_id: publicId,
      timestamp: timestamp
    };
    
    // String de assinatura em ordem alfabética
    const paramStrings = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    
    const stringToSign = paramStrings + apiSecret;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    console.log('🔐 Debug assinatura:');
    console.log('  - Timestamp:', timestamp);
    console.log('  - Public ID:', publicId);
    console.log('  - API Key:', apiKey);
    console.log('  - API Secret (primeiros 10 chars):', apiSecret.substring(0, 10) + '...');
    console.log('  - String to sign:', stringToSign.substring(0, 50) + '...');
    console.log('  - Signature:', signature);

    // 4. Upload para Cloudinary
    console.log('☁️ Fazendo upload para Cloudinary...');
    const formData = new FormData();
    
    formData.append('file', buffer, {
      filename: `boleto_${serial}.pdf`,
      contentType: 'application/pdf'
    });
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('public_id', publicId);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      }
    );

    console.log('📡 Status:', cloudinaryResponse.status);
    const responseText2 = await cloudinaryResponse.text();
    console.log('📄 Resposta completa:', responseText2);

    const result = JSON.parse(responseText2);

    if (result.secure_url) {
      console.log('✅ Upload bem-sucedido! URL:', result.secure_url);
      return res.status(200).json({ 
        success: true,
        url: result.secure_url 
      });
    } else {
      console.log('❌ Upload falhou:', result);
      throw new Error('Upload falhou: ' + JSON.stringify(result));
    }

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

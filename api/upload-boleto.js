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
      error: 'Parâmetros faltando',
      received: { serial, cnpj, cloudName, hasApiKey: !!apiKey, hasApiSecret: !!apiSecret }
    });
  }

  try {
    // 1. Busca o PDF do boleto
    const boletoPdf = await fetch(
      `http://navarrocloud.ramo.com.br/files/api/Boleto?serial=${serial}&cnpj=${cnpj}`,
      {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzAzMDM4Nzh9.I8qkqlAXM0MhZ-zzcFJj1Cscy2LnnuUX8K5u7frrmhQ'
        }
      }
    );

    if (!boletoPdf.ok) {
      throw new Error('Erro ao buscar boleto: ' + boletoPdf.status);
    }

    const arrayBuffer = await boletoPdf.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Criar assinatura para upload autenticado
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `boleto_${serial}`;
    
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    console.log('=== DEBUG UPLOAD ===');
    console.log('Cloud Name:', cloudName);
    console.log('API Key:', apiKey);
    console.log('Public ID:', publicId);
    console.log('Timestamp:', timestamp);
    console.log('Signature:', signature);

    // 3. Upload para Cloudinary usando FormData com autenticação
    const formData = new FormData();
    
    formData.append('file', buffer, {
      filename: `boleto_${serial}.pdf`,
      contentType: 'application/pdf'
    });
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('public_id', publicId);

    console.log('URL do upload:', `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      }
    );

    const responseText = await cloudinaryResponse.text();
    console.log('Resposta do Cloudinary (raw):', responseText);
    
    const result = JSON.parse(responseText);
    console.log('Resposta do Cloudinary (parsed):', result);

    if (result.secure_url) {
      return res.status(200).json({ 
        success: true,
        url: result.secure_url 
      });
    } else {
      throw new Error('Upload falhou: ' + JSON.stringify(result));
    }

  } catch (error) {
    console.error('Erro completo:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

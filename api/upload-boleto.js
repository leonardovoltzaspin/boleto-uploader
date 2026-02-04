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
    const resourceType = 'raw';
    
    // A assinatura DEVE incluir resource_type se ele for usado
    const stringToSign = `public_id=${publicId}&resource_type=${resourceType}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    // 3. Upload para Cloudinary
    const formData = new FormData();
    
    formData.append('file', buffer, {
      filename: `boleto_${serial}.pdf`,
      contentType: 'application/pdf'
    });
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('public_id', publicId);
    formData.append('resource_type', resourceType);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
      {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      }
    );

    const result = await cloudinaryResponse.json();

    if (result.secure_url) {
      return res.status(200).json({ 
        success: true,
        url: result.secure_url 
      });
    } else {
      throw new Error('Upload falhou: ' + JSON.stringify(result));
    }

  } catch (error) {
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

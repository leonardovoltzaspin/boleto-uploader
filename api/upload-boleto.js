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

  console.log('=== INICIO DEBUG ===');
  console.log('Parametros recebidos:', { serial, cnpj, cloudName, apiKey: apiKey ? 'presente' : 'ausente', apiSecret: apiSecret ? 'presente' : 'ausente' });

  if (!serial || !cnpj || !cloudName || !apiKey || !apiSecret) {
    return res.status(400).json({ 
      error: 'Parâmetros faltando'
    });
  }

  try {
    // 1. Busca o PDF do boleto
    console.log('Buscando PDF...');
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
    console.log('PDF baixado com sucesso. Tamanho:', buffer.length, 'bytes');

    // 2. Criar assinatura para upload autenticado
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `boleto_${serial}`;
    const resourceType = 'raw';
    
    const stringToSign = `public_id=${publicId}&resource_type=${resourceType}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    console.log('=== DADOS DO UPLOAD ===');
    console.log('Cloud Name:', cloudName);
    console.log('API Key:', apiKey);
    console.log('Public ID:', publicId);
    console.log('Resource Type:', resourceType);
    console.log('Timestamp:', timestamp);
    console.log('String to sign:', stringToSign);
    console.log('Signature:', signature);

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

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
    console.log('URL de upload:', uploadUrl);
    console.log('Enviando para Cloudinary...');

    const cloudinaryResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    console.log('Status da resposta:', cloudinaryResponse.status);
    
    const responseText = await cloudinaryResponse.text();
    console.log('Resposta raw do Cloudinary:', responseText);

    const result = JSON.parse(responseText);
    console.log('Resposta parsed:', JSON.stringify(result, null, 2));

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
    console.error('Stack:', error.stack);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

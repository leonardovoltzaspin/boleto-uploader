export default async function handler(req, res) {
  // Permite CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serial, cnpj, cloudName, uploadPreset } = req.body;

  if (!serial || !cnpj || !cloudName || !uploadPreset) {
    return res.status(400).json({ error: 'Parâmetros faltando' });
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

    const buffer = await boletoPdf.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // 2. Upload para Cloudinary
    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: `data:application/pdf;base64,${base64}`,
          upload_preset: uploadPreset,
          public_id: `boleto_${serial}`,
          resource_type: 'raw'
        })
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

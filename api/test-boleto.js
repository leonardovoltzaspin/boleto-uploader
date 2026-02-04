export default async function handler(req, res) {
  const { serial, cnpj } = req.query;

  try {
    // Busca o PDF
    const boletoPdf = await fetch(
      `http://navarrocloud.ramo.com.br/files/api/Boleto?serial=${serial}&cnpj=${cnpj}`,
      {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzAzMDM4Nzh9.I8qkqlAXM0MhZ-zzcFJj1Cscy2LnnuUX8K5u7frrmhQ'
        }
      }
    );

    if (!boletoPdf.ok) {
      throw new Error('Erro ao buscar boleto');
    }

    const buffer = await boletoPdf.arrayBuffer();

    // Retorna o PDF diretamente
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="boleto.pdf"');
    res.send(Buffer.from(buffer));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

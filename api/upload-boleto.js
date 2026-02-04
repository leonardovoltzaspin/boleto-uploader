async function run(serial, cnpj, cloudName, apiKey, apiSecret) {
  try {
    var response = await request.fetchAsync(
      'https://sua-url.vercel.app/api/upload-boleto',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serial: serial,
          cnpj: cnpj,
          cloudName: cloudName,
          apiKey: apiKey,
          apiSecret: apiSecret
        })
      }
    );

    if (!response || response.status !== 200) {
      throw new Error('Erro: ' + response.status + ' - ' + response.body);
    }

    var result = JSON.parse(response.body);
    
    if (result.success) {
      return result.url;
    } else {
      throw new Error(result.error);
    }

  } catch (e) {
    return JSON.stringify({
      erro: true,
      mensagem: e.message
    });
  }
}

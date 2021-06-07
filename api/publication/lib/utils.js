const fs = require("fs");
const { keccak256 } = require("js-sha3");
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, StandardFonts, decodePDFRawStream, rgb } = require("pdf-lib");
const QRCode = require('qrcode')

const BLANK_PATH = `${process.cwd()}/public/uploads/blank.pdf`;

function extractRawAttachments(pdfDoc) {
  if (!pdfDoc.catalog.has(PDFName.of('Names'))) return [];
  const Names = pdfDoc.catalog.lookup(PDFName.of('Names'), PDFDict);
  
  if (!Names.has(PDFName.of('EmbeddedFiles'))) return [];
  const EmbeddedFiles = Names.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
  
  if (!EmbeddedFiles.has(PDFName.of('Names'))) return [];
  const EFNames = EmbeddedFiles.lookup(PDFName.of('Names'), PDFArray);
  
  const rawAttachments = [];
  for (let idx = 0, len = EFNames.size(); idx < len; idx += 2) {
    const fileName = EFNames.lookup(idx);
    const fileSpec = EFNames.lookup(idx + 1, PDFDict);
    rawAttachments.push({ fileName, fileSpec });
  }
  
  return rawAttachments;
};

function extractAttachments(pdfDoc) {
  const rawAttachments = extractRawAttachments(pdfDoc);
  return rawAttachments.map(({ fileName, fileSpec }) => {
    const stream = fileSpec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'), PDFStream);
    return {
      name: fileName.decodeText(),
      data: decodePDFRawStream(stream).decode(),
    };
  });
};

function Utf8ArrayToStr(array) {
  var out, i, len, c;
  var char2, char3;

  out = "";
  len = array.length;
  i = 0;
  while(i < len) {
    c = array[i++];
    switch(c >> 4)
    { 
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) | ((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0));
        break;
    }
  }

  return out;
}

module.exports = {
  async buildRaw(uuid, name, originalPath) {
    // Use a standard blank file in order to achieve deterministic results
    const blankBytes = fs.readFileSync(BLANK_PATH);
    const pdfDoc = await PDFDocument.load(blankBytes, { updateMetadata: false });
    pdfDoc.removePage(0);

    // Load the original file
    const originalBytes = fs.readFileSync(originalPath);
    const original = await PDFDocument.load(originalBytes, { updateMetadata: false });

    // TODO copy metadata from original file (creation date, author, etc) into raw file

    // Copy pages from original file
    const pageIndexes = Array.from(Array(original.getPageCount()).keys());
    const pages = await pdfDoc.copyPages(original, pageIndexes);
    for (let i = 0; i < pages.length; i++) {
      pdfDoc.addPage(pages[i]);
    }

    // Create directory if it doesn't exist
    try {
      fs.mkdirSync(`${process.cwd()}/public/uploads/${uuid}`);
    } catch (err) {}

    // Save file
    const path = `${process.cwd()}/public/uploads/${uuid}/${name}`;
    const data = await pdfDoc.save();
    fs.writeFileSync(path, data);

    // Return raw file data
    const type = "application/pdf";
    const size = fs.statSync(path).size;
    const hash = "0x" + keccak256(data);
    return { path, name, type, size, hash };
  },

  async attachData(publication) {
    const { uuid } = publication;

    // Load raw pdf file
    const rawPath = `${process.cwd()}/public${publication.pdf_raw.url}`;
    const rawBytes = fs.readFileSync(rawPath);
    const pdfDoc = await PDFDocument.load(rawBytes, { updateMetadata: false });

    // Get the first page of the document
    const pages = pdfDoc.getPages()
    const firstPage = pages[0]

    // Get the width and height of the first page
    const { width, height } = firstPage.getSize();

    // Add a page to the end (with same size)
    const newPage = pdfDoc.addPage([width, height]);
    
    // Embed the font
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
 
    // Draw a string of text toward the top of the page
    const fontSize = 16;
    newPage.drawText(
      `This eBook was published using the SourceCheck.org HonorBox\n` + 
      `system, which notarizes content and royalty commitments as\n` + 
      `authentic. If you enjoyed it, the publisher has requested a\n` + 
      `suggested donation of 10 $USD to be distributed between the\n` +
      `contributors. To make a donation, use a Solana-compatible\n` +
      `wallet and send your donation to: \n\n` +
      `${publication.royalty_structure.account}\n\n` +
      `Or use the QR code bellow:`,
    {
      x: 50,
      y: height - 4 * fontSize,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0.53, 0.71),
    });

    // Create directory if it doesn't exist
    try {
      fs.mkdirSync(`${process.cwd()}/public/uploads/${uuid}`);
    } catch (err) {}

    // Create qrcode image containing donation (shared) account address
    const qrcodePath = `${process.cwd()}/public/uploads/${uuid}/qrcode.png`;
    await QRCode.toFile(qrcodePath, publication.royalty_structure.account);
    const qrcodeBytes = fs.readFileSync(qrcodePath);
    const qrcodeImage = await pdfDoc.embedPng(qrcodeBytes)
    const pngDims = qrcodeImage.scale(1.2)

    newPage.drawImage(qrcodeImage, {
      x: newPage.getWidth() / 2 - pngDims.width / 2,
      y: newPage.getHeight() / 2 - pngDims.height,
      width: pngDims.width,
      height: pngDims.height,
    })

    // Attach vp to the pdf
    const buffer = Buffer.from(JSON.stringify(publication.publisher_vp)).toString('base64');
    await pdfDoc.attach(buffer, "vp.jsonld", {
      mimeType: "application/ld+json",
      description: "Verifiable Presentation",
    });

    // Save file to disk
    const name = publication.slug;
    const path = `${process.cwd()}/public/uploads/${uuid}/${name}`;
    const data = await pdfDoc.save();
    fs.writeFileSync(path, data);

    // Return signed file data
    const type = "application/pdf";
    const size = fs.statSync(path).size;
    return { path, name, type, size };
  },

  async reconstructRaw(uuid, name, uploadedPath) {
    // Create temporary directory if it doesn't exist
    try {
      fs.mkdirSync(`${process.cwd()}/public/uploads/${uuid}`);
    } catch (err) {}

    // Use a standard blank file as a base file to achieve deterministic results
    const blankBytes = fs.readFileSync(BLANK_PATH);
    const pdfDoc = await PDFDocument.load(blankBytes, { updateMetadata: false });
    pdfDoc.removePage(0);

    // Load the uploaded file
    const uploadedFileBytes = fs.readFileSync(uploadedPath);
    const uploadedFile = await PDFDocument.load(uploadedFileBytes, { updateMetadata: false });

    // Extract the verifiable presentation and parse it as an object
    const attachments = extractAttachments(uploadedFile);
    const vpFile = attachments.find((attachment) => attachment.name === 'vp.jsonld');
    const vpString = Utf8ArrayToStr(vpFile.data);
    const vp = JSON.parse(vpString);
    
    // Copy pages from uploaded file to base file
    let pageIndexes = Array.from(Array(uploadedFile.getPageCount() - 1).keys());
    const pages = await pdfDoc.copyPages(uploadedFile, pageIndexes);
    for (let i = 0; i < pages.length; i++) {
      pdfDoc.addPage(pages[i]);
    }

    // Save reconstructed file in the temporary directory created for this verification
    const path = `${process.cwd()}/public/uploads/${uuid}/${name}`;
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(path, pdfBytes);

    // Calculate hash
    const data = fs.readFileSync(path);
    const hash = "0x" + keccak256(data);

    // Return the verifiable presentation and the hash of the reconstructed raw file
    return { vp, hash };
  },
};

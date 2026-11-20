/**
 * The error the PDF export throws when it can't download its code or fonts:
 * offline, a connection that stopped sending, or files replaced by a newer
 * deployment. It lives in this tiny module so the export button can make and
 * recognise it without importing the PDF code itself.
 */
export const PDF_LOAD_ERROR = 'PdfLoadError';

export function pdfLoadError(message: string, cause?: unknown): Error {
  const error = new Error(message, { cause });
  error.name = PDF_LOAD_ERROR;
  return error;
}

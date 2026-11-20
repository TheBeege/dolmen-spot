/**
 * `name` of the error the PDF export throws when it can't download its fonts
 * (offline, or the files were replaced by a newer deployment). It lives in
 * this tiny module so the export button can recognise the error without
 * importing the PDF code itself.
 */
export const PDF_FONT_LOAD_ERROR = 'PdfFontLoadError';

# @ndycode/timetablekit-provider-pdfjs

The PDF.js provider extracts text from `application/pdf` input and can render
text-free pages to bounded PNG images for an injected TimetableKit
`OcrProvider`.

PDF JavaScript actions are not requested or executed. The default PDF.js loader
is browser-oriented. Configure the PDF.js worker in the host application and
provide a `loadDocument` seam when running in a non-browser test or server
environment. Rendered pages are held in memory only for the OCR call.

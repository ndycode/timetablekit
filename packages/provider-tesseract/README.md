# @ndycode/timetablekit-provider-tesseract

This package is a lazy browser adapter around Tesseract.js. It creates one
worker per recognition call, reports progress, checks image pixel and byte
limits before creating the worker, and terminates the worker in cleanup.

Image bytes stay in memory for the recognition call. The adapter does not log
or persist image data. Inject `createWorker` in tests or hosts that provide a
custom Tesseract worker setup.

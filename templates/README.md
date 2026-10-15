# GAD PIMME Export Template

`gad-pimme-box-16-and-17.xlsx` is the unchanged template supplied by the user on
2026-10-15 as `C:/Users/joelm/Downloads/HGDG-PIMME-Box-16-and-17.xlsx`.
SHA256: `a890dc3c0652686ad74b83ee606b0adf9cb4d0dd936ed15832cbb3b0321b3015`.

Keep this versioned asset outside the repository's ignored `public/` and `assets/`
directories. Vite bundles it through `lib/gadPimmeExcel.ts`.

The exporter fills saved OU/year answers, remarks, active MOV links and optional
signatories. It corrects the missing F11 formula, incorrect F66 aggregation and
element score caps at runtime, without modifying the source file or app scoring.
It standardizes the Box 17 MOV/recommendation headers and leaves evaluator fields
and the unknown completion date blank. The original guide and reference notes stay.

Multiple MOV links are available in the MOVs worksheet. Very long remarks continue
verbatim in the Remarks worksheet so Excel's row-height limits cannot clip them.
Run `npm run test:gad-pimme-export` when replacing or changing the template.

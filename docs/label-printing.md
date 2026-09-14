# Label printing with Brother Smooth Print

Datomærkning uses [Brother Smooth Print's web integration](https://support.brother.com/g/s/es/htmldoc/smoothprint/) on iPad, iPhone, and Android. The device connects directly to the printer over Wi-Fi or Bluetooth. Install Smooth Print on each mobile device; no shared computer, print service, or server signing keys are needed.

Smooth Print supports iOS 14.1+ and Android 8.0+. Computers use the existing system print dialog because Smooth Print has no desktop version.

## Connect a printer

1. Install the latest Smooth Print from [Brother's download page](https://support.brother.com/g/s/es/htmldoc/smoothprint/overview/download/).
2. In Smooth Print, choose the printer and configure Wi-Fi or Bluetooth. For Wi-Fi, the device and printer must be on the same network. For Bluetooth, pair the printer in the device's Bluetooth settings first.
3. Alternatively, open **Datomærkning → Indstillinger → Printer** on the mobile device. Choose QL-820NWB or QL-820NWBc and the connection type. Enter the printer's IP address for Wi-Fi, or its Bluetooth MAC address for Bluetooth. Bluetooth on iPad/iPhone also requires the printer's serial number. Select **Tilslut i Smooth Print** and complete the connection there.
4. Return to Datomærkning, select the installed label size, and print one test label.

The app opens Brother's documented `brotherwebprint://connect` URL. Smooth Print owns the selected printer and connection. The website does not report an online status or save a separate printer selection per location. Check the printer selected in Smooth Print when changing location.

## Print labels

Select a product, production date/time, and number of copies, then choose **Print i Smooth Print**. The product's expiry is calculated as before. Products without an expiry still prompt for it, with an option to save it when the user has permission to edit products.

The browser prepares a single-page PDF from the label at 300 DPI before the click. It hands the PDF to Smooth Print using `brotherwebprint://print` with `filename`, base64 `fileattach`, `size`, and `copies`. The attachment stays in the local app handoff; it is not uploaded or exposed through a public download URL. Each job gets a unique filename to prevent reuse of an earlier label.

The website requests the handoff from a user click. It cannot establish whether Smooth Print is installed or whether printing succeeded. Printing results and printer errors appear in Smooth Print. There are no automatic print retries. If the app does not open, install it and allow the browser to open the external app, or use **Brug enhedens printdialog**.

## Label stock

| Layout | Smooth Print paper ID | Required stock |
| --- | --- | --- |
| 62 × 29 mm | `DieCutW62H29` | 62 × 29 mm die-cut labels |
| 62 × 40 mm | `RollW62` | Monochrome 62 mm continuous roll |
| 90 × 29 mm | `DieCutW29H90` | 29 × 90 mm die-cut labels |

The 90 × 29 layout is rotated inside a 29 × 90 mm PDF to follow the roll direction. PDFs use actual-size printing with portrait orientation. Match the installed stock to the selected format; configure cutter settings in Smooth Print or on the printer.

References: [PDF printing](https://support.brother.com/g/s/es/htmldoc/smoothprint/reference/pdf_printing/), [attachment and print parameters](https://support.brother.com/g/s/es/htmldoc/smoothprint/reference/optional_parameters/), [connection parameters](https://support.brother.com/g/s/es/htmldoc/smoothprint/reference/connect_printer/).

## Verification

Without hardware, use the system print dialog to save a PDF and check expiry calculation. Code checks can validate the attached PDF dimensions and URL parameters. A real mobile device with Smooth Print and a printer is still required to verify the app handoff, Bluetooth/Wi-Fi connection, continuous-roll length, rotation, cutting, multiple copies, and printer errors.

## Products shown at a location

In **Indstillinger → Produkter**, users with catalog-management and label-printing permission can configure which products appear for everyone at the selected location. Kiosk accounts cannot edit these settings.

**Vis alle produkter** is the default. Turn it off to select categories or individual products. Categories include their descendants and products added later. Uncheck a product to exclude it even when its category is selected. An empty selection shows no products. The location's existing product availability still applies.

Selections are stored in Convex per organization and location. Concurrent edits require reloading the settings before saving, so one user's changes cannot silently overwrite another's.

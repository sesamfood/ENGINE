# Direct label printing

The Datomærkning page discovers printers through QZ Tray and remembers a printer per browser, organization, and location. It sends a 300 DPI PNG directly to the selected printer queue. QZ Tray 2.2 or newer and the printer manufacturer's driver are required. A successful response means the job reached the print queue; it does not prove that paper came out.

## Computers

1. Install [QZ Tray](https://qz.io/download/) and the label printer's driver.
2. Add the printer to the computer and verify it prints through its driver. For a Brother QL-820NWB, use a Brother driver with pixel/image printing support. Configure the installed label stock and cutter settings there.
3. In Datomærkning, select **Tilslut printer**, use `localhost`, and select **Find printere**.
4. Approve QZ's connection request. Select the discovered printer and the installed label size, then select **Par printer**.
5. Reopen the setup and print one test label. Verify orientation, full text, dimensions, and cutting before printing a batch.

## Tablets

A computer on the same network runs QZ Tray and owns the printer. The tablet connects to that computer, not to the printer's Bluetooth or IP endpoint. The computer must remain powered on.

Configure the host using [QZ's print-server guide](https://qz.io/docs/print-server). Give it a stable fully qualified hostname and a TLS certificate trusted by the tablet for that hostname. Use a certificate from a trusted CA for a mixed iPad/Android setup. Permit the QZ secure WebSocket port through the local firewall; do not expose the print service to the public Internet. The standard secure ports are 8181, 8282, 8383, and 8484.

Enter the print-service hostname in **Printtjeneste**, approve local-network access when the browser requests it, then find and pair the printer. The app uses secure WebSockets only. It does not disable certificate checks or fall back to insecure WebSockets. Do not use the older Android insecure-browser-flag workaround from the QZ guide.

## Silent printing

Without a signing certificate, QZ asks the user to approve operations. To allow approval to be remembered, configure [QZ message signing](https://qz.io/docs/signing):

- `QZ_CERTIFICATE`: the contents of QZ's `digital-certificate.txt`.
- `QZ_PRIVATE_KEY`: the matching unencrypted RSA PEM private key.

Set both variables on the **Next.js/Vercel server**, not Convex. Literal PEM newlines and escaped `\n` are accepted. Never use a `NEXT_PUBLIC_` variable for the private key or commit the key. Restart/redeploy Next.js after changing them.

Use a valid certificate trusted by the QZ installation. A QZ-issued certificate may require a paid license; do not purchase one as part of setup without approval. QZ's locally generated demo certificate can be used for development on the machine that trusts it. Once signing is configured, approve the site in QZ and remember the decision.

The message-signing certificate is separate from the print host's TLS certificate. Both are needed for silent printing from tablets.

The signing route checks the signed-in user's Datomærkning permission and location access in Convex. It constructs only `printers.find` and fixed-size PNG `print` requests. It does not accept arbitrary commands, hashes, raw printer languages, external image URLs, file paths, or network-printer destinations.

## Failures

- No printers found: check the driver on the QZ host.
- Connection failed: check QZ Tray, hostname, trusted TLS certificate, browser local-network permission, and firewall.
- Saved printer disappeared: find and select the printer again.
- Print not confirmed: inspect the physical printer and queue before retrying. The app never automatically retries a print that may already have been submitted.
- The browser print dialog remains available as an explicit fallback.

Hardware acceptance still requires a real printer: verify a single label and multiple copies on the actual computer and tablet browsers, disconnect/reconnect the host, and check out-of-paper behavior. Automated code checks cannot establish physical printer compatibility.

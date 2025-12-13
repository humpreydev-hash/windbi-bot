import qrcode from "qrcode-terminal"
import QRCode from "qrcode"

sock.ev.on("connection.update", async ({ qr, connection }) => {
  if (qr) {
    console.log("\n=== QR LOGIN ===\n")
    qrcode.generate(qr, { small: true })

    const qrLink = await QRCode.toDataURL(qr)
    console.log("\nBuka QR di browser:")
    console.log(qrLink)
  }

  if (connection === "open") {
    console.log("Bot WhatsApp berhasil login")
  }
})

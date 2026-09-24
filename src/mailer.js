const nodemailer = require("nodemailer");
const config = require("./config");

function formatPrice(price) {
  if (price === null || price === undefined) return "cena neuvedena";
  return `${price.toLocaleString("cs-CZ")} Kc`;
}

function groupByLabel(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.sourceLabel || "ostatni";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function renderTable(items, renderExtra) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">
          <a href="${item.url}">${item.title}</a><br>
          <small>ID: ${item.id}</small>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap;">
          ${renderExtra(item)}
        </td>
      </tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;">${rows}</table>`;
}

function section(title, items, renderExtra) {
  if (items.length === 0) return "";
  const groups = groupByLabel(items);
  const groupsHtml = [...groups.entries()]
    .map(([label, groupItems]) => `<h3>${label}</h3>${renderTable(groupItems, renderExtra)}`)
    .join("");
  return `<h2>${title}</h2>${groupsHtml}`;
}

function buildHtml(newListings, cheaperListings) {
  const newSection = section("Nove nabidky", newListings, (item) => formatPrice(item.price));
  const cheaperSection = section("Zlevnene nabidky", cheaperListings, (item) =>
    `${formatPrice(item.oldPrice)} &rarr; <b>${formatPrice(item.price)}</b>`
  );

  return `<div style="font-family:sans-serif;">${newSection}${cheaperSection}</div>`;
}

// recipientReports: Map<email, { newListings: [], cheaperListings: [] }>
// kazdy prijemce dostane jeden email jen s nabidkami z URL, kde je v jejich email_to
async function sendReports(recipientReports) {
  if (recipientReports.size === 0) return;

  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    console.warn("[mailer] SMTP neni nakonfigurovane (SMTP_HOST/SMTP_USER/SMTP_PASS), email se neposila.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  for (const [email, { newListings, cheaperListings }] of recipientReports) {
    const subjectParts = [];
    if (newListings.length) subjectParts.push(`${newListings.length} novych`);
    if (cheaperListings.length) subjectParts.push(`${cheaperListings.length} zlevnenych`);

    await transporter.sendMail({
      from: config.smtp.from,
      to: email,
      subject: `Bazos watcher: ${subjectParts.join(", ")}`,
      html: buildHtml(newListings, cheaperListings),
    });

    console.log(`[mailer] Email report odeslan na ${email}.`);
  }
}

module.exports = { sendReports, formatPrice };

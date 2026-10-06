const { GoogleGenAI } = require("@google/genai");
const Invoice = require("../models/Invoice");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = "gemini-3.8-flash";

// --------------------------------------------------
// Parse Invoice From Text
// --------------------------------------------------

const parseInvoiceFromText = async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      message: "Text is required",
    });
  }

  try {
    const prompt = `
You are an expert Invoice Data Extraction AI.

Analyze the following text and extract the relevant information required to create an invoice.

Return ONLY a valid JSON object.

The JSON object MUST follow this exact structure:

{
  "clientName": "string",
  "email": "string",
  "address": "string",
  "items": [
    {
      "name": "string",
      "quantity": 0,
      "unitPrice": 0
    }
  ]
}

Rules:
- clientName must be a string.
- email should be an empty string if unavailable.
- address should be an empty string if unavailable.
- quantity must be a number.
- unitPrice must be a number.
- Do not include markdown.
- Do not include code fences.
- Do not include explanations.
- Return ONLY JSON.

Invoice text:

--- TEXT START ---
${text}
--- TEXT END ---
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;

    const parsedData = JSON.parse(responseText);

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error parsing invoice with Gemini:", error);

    return res.status(500).json({
      message: "Failed to parse invoice data from text",
      details: error.message,
    });
  }
};

// --------------------------------------------------
// Generate Reminder Email
// --------------------------------------------------

const generateReminderEmail = async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    return res.status(400).json({
      message: "Invoice ID is required",
    });
  }

  try {
    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const prompt = `
You are a professional and polite accounting assistant.

Write a friendly reminder email to a client about an overdue or upcoming invoice payment.

Use the following invoice details:

Client Name: ${invoice.billTo.clientName}
Invoice Number: ${invoice.invoiceNumber}
Amount Due: ${invoice.total.toFixed(2)}
Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}

Requirements:
- Be professional and friendly.
- Keep the email concise.
- Clearly mention the invoice number.
- Clearly mention the amount due.
- Clearly mention the due date.
- Do not sound aggressive.
- Start the response with "Subject:".
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    const responseText = response.text;

    return res.status(200).json({
      reminderText: responseText,
    });

  } catch (error) {
    console.error(
      "Error generating reminder email with Gemini:",
      error
    );

    return res.status(500).json({
      message: "Failed to generate reminder email",
      details: error.message,
    });
  }
};

// --------------------------------------------------
// Dashboard AI Summary
// --------------------------------------------------

const getDashboardSummary = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      user: req.user.id,
    });

    if (invoices.length === 0) {
      return res.status(200).json({
        insights: [
          "No invoice data available to generate insights.",
        ],
      });
    }

    const totalInvoices = invoices.length;

    const paidInvoices = invoices.filter(
      (inv) => inv.status === "Paid"
    );

    const unpaidInvoices = invoices.filter(
      (inv) => inv.status !== "Paid"
    );

    const totalRevenue = paidInvoices.reduce(
      (acc, inv) => acc + inv.total,
      0
    );

    const totalOutstanding = unpaidInvoices.reduce(
      (acc, inv) => acc + inv.total,
      0
    );

    const dataSummary = `
Total number of invoices: ${totalInvoices}

Total paid invoices: ${paidInvoices.length}

Total unpaid/pending invoices: ${unpaidInvoices.length}

Total revenue from paid invoices: ${totalRevenue.toFixed(2)}

Total outstanding amount from unpaid/pending invoices: ${totalOutstanding.toFixed(2)}

Recent invoices:
${invoices
  .slice(0, 5)
  .map(
    (inv) =>
      `Invoice #${inv.invoiceNumber}, amount ${inv.total.toFixed(
        2
      )}, status ${inv.status}`
  )
  .join("\n")}
`;

    const prompt = `
You are a friendly and insightful financial analyst helping a small business owner.

Analyze the following invoice data and provide 2-3 concise and actionable insights.

Rules:
- Each insight should be a short string.
- Do not simply repeat the provided numbers.
- Give practical suggestions.
- If outstanding invoices are high, suggest sending payment reminders.
- If revenue is strong, provide an encouraging observation.
- Return ONLY valid JSON.
- Do not use markdown.
- Do not use code fences.

Return exactly this structure:

{
  "insights": [
    "Insight 1",
    "Insight 2",
    "Insight 3"
  ]
}

Invoice Data:

${dataSummary}
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;

    const parsedData = JSON.parse(responseText);

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error(
      "Error getting dashboard summary with Gemini:",
      error
    );

    return res.status(500).json({
      message: "Failed to generate dashboard insights",
      details: error.message,
    });
  }
};

module.exports = {
  parseInvoiceFromText,
  generateReminderEmail,
  getDashboardSummary,
};
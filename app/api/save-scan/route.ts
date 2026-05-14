import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}

async function syncLeadToTelecrm({
  name,
  phone,
}: {
  name: string
  phone: string
}) {
  const apiUrl = process.env.TELECRM_API_URL
  const apiKey = process.env.TELECRM_API_KEY

  if (!apiUrl || !apiKey) {
    throw new Error("TeleCRM is not configured")
  }

  const payload = {
    fields: {
      phone,
      name,
    },
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  const text = await response.text()
  let data: unknown = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    throw new Error(
      `TeleCRM request failed with ${response.status}${text ? `: ${text}` : ""}`,
    )
  }

  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    typeof data.status === "string" &&
    data.status.toLowerCase() === "error"
  ) {
    const errorString =
      "errorString" in data && typeof data.errorString === "string"
        ? data.errorString
        : "Unknown TeleCRM error"
    throw new Error(`TeleCRM error: ${errorString}`)
  }

  return data
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, problem, imageData } = await req.json()

    if (!name || !phone || !problem || !imageData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)

    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
    }

    const scan = await prisma.scan.create({
      data: { name, phone: normalizedPhone, problem, imageData },
    })

    try {
      await syncLeadToTelecrm({
        name: name.trim(),
        phone: normalizedPhone,
      })
    } catch (telecrmError) {
      console.error("TeleCRM sync failed:", telecrmError)
      const message =
        telecrmError instanceof Error ? telecrmError.message : "TeleCRM sync failed"

      return NextResponse.json(
        {
          error: message,
          id: scan.id,
          savedToDatabase: true,
          savedToTelecrm: false,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      id: scan.id,
      savedToDatabase: true,
      savedToTelecrm: true,
    })
  } catch (error) {
    console.error("Failed to save scan:", error)
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? `Failed to save scan: ${error.message}`
        : "Failed to save scan"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

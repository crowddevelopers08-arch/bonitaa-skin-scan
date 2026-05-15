import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}

async function syncLeadToTelecrm({
  name,
  phone,
  location,
  problem,
  pageUrl,
}: {
  name: string
  phone: string
  location: string
  problem: string
  pageUrl: string
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
      location,
      problem,
      form_name: "skin website leads",
      source: "skin website leads",
      lead_source: "skin website leads",
      website_url: pageUrl,
      page_url: pageUrl,
      live_url: pageUrl,
    },
  }

  const primaryResult = await readTelecrmResponse(
    await sendTelecrmRequest(apiUrl, apiKey, payload),
  )

  if (primaryResult.ok) {
    return primaryResult.data
  }

  if (
    primaryResult.status === 403 &&
    primaryResult.rawText.includes("SECRET_KEY_MISSING") &&
    apiUrl.includes("/v2/enterprise/")
  ) {
    const fallbackUrl = buildLegacyTelecrmUrl(apiUrl)

    if (fallbackUrl) {
      const fallbackResult = await readTelecrmResponse(
        await sendTelecrmRequest(fallbackUrl, apiKey, payload),
      )

      if (fallbackResult.ok) {
        return fallbackResult.data
      }

      throw new Error(
        `TeleCRM request failed with ${fallbackResult.status}${
          fallbackResult.rawText ? `: ${fallbackResult.rawText}` : ""
        }`,
      )
    }
  }

  throw new Error(
    `TeleCRM request failed with ${primaryResult.status}${
      primaryResult.rawText ? `: ${primaryResult.rawText}` : ""
    }`,
  )
}

function buildLegacyTelecrmUrl(apiUrl: string) {
  const match = apiUrl.match(/\/v2\/enterprise\/([^/]+)\/autoupdatelead$/)

  if (!match) {
    return null
  }

  const enterpriseId = match[1]
  return `https://next.telecrm.in/autoupdate/enterprise/${enterpriseId}/autoupdatelead`
}

async function sendTelecrmRequest(
  url: string,
  apiKey: string,
  payload: {
    fields: {
      phone: string
      name: string
      location: string
      problem: string
      form_name: string
      source: string
      lead_source: string
      website_url: string
      page_url: string
      live_url: string
    }
  },
) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })
}

async function readTelecrmResponse(response: Response) {
  const rawText = await response.text()
  let data: unknown = null

  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    data = rawText
  }

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      rawText,
      data,
    }
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

  return {
    ok: true as const,
    status: response.status,
    rawText,
    data,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, problem, imageData, location, pageUrl } = await req.json()

    if (!name || !phone || !problem || !imageData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)

    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
    }

    if (!location || typeof location !== "string" || !location.trim()) {
      return NextResponse.json({ error: "Location is required" }, { status: 400 })
    }

    const normalizedLocation = location.trim()
    const existingScan = await prisma.scan.findFirst({
      where: { phone: normalizedPhone },
      select: { id: true, createdAt: true },
    })

    if (existingScan) {
      return NextResponse.json(
        {
          error: "This phone number has already been used to submit the form.",
          duplicate: true,
          id: existingScan.id,
        },
        { status: 409 },
      )
    }

    const scan = await prisma.scan.create({
      data: { name, phone: normalizedPhone, location: normalizedLocation, problem, imageData },
    })

    try {
      await syncLeadToTelecrm({
        name: name.trim(),
        phone: normalizedPhone,
        location: normalizedLocation,
        problem,
        pageUrl:
          typeof pageUrl === "string" && pageUrl.trim()
            ? pageUrl.trim()
            : "https://hairscan.bonitaa.co.in/",
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

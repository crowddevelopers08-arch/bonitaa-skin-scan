import type { PrismaClient } from "@prisma/client"

const problemLabels: Record<string, string> = {
  "hair-fall": "Hair Fall",
  "crown-thinning": "Crown Thinning",
  "frontal-hair-loss": "Frontal Hair Loss",
  "dandruff-scalp-issues": "Dandruff / Scalp Issues",
  "low-hair-density": "Low Hair Density",
  acne: "Acne",
  pigmentation: "Pigmentation",
  dullness: "Dullness",
  tanning: "Tanning",
  "uneven-skin-tone": "Uneven Skin Tone",
  "open-pores": "Open Pores",
}

const hairProblems = [
  "hair-fall",
  "crown-thinning",
  "frontal-hair-loss",
  "dandruff-scalp-issues",
  "low-hair-density",
]

const skinProblems = [
  "acne",
  "pigmentation",
  "dullness",
  "tanning",
  "uneven-skin-tone",
  "open-pores",
]

const allProblems = [...skinProblems]
const locationOptions = [
  "Trichy",
  "Coimbatore",
  "Madurai",
  "Chennai",
  "Other location",
]

type DashboardSearchParams = Promise<{
  q?: string
  problem?: string
  location?: string
  dateFrom?: string
  dateTo?: string
  page?: string
}>

type ScanDashboardProps = {
  searchParams?: DashboardSearchParams
  prismaClient: PrismaClient
  basePath: string
  title: string
}

function isHairProblem(problem: string): boolean {
  return hairProblems.includes(problem)
}

function isSkinProblem(problem: string): boolean {
  return skinProblems.includes(problem)
}

function matchesDateRange(scanDate: Date, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) {
    return true
  }

  const scanTime = scanDate.getTime()

  if (dateFrom) {
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    if (scanTime < from.getTime()) {
      return false
    }
  }

  if (dateTo) {
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    if (scanTime > to.getTime()) {
      return false
    }
  }

  return true
}

export async function ScanDashboard({
  searchParams,
  prismaClient,
  basePath,
  title,
}: ScanDashboardProps) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const query = resolvedSearchParams.q?.trim().toLowerCase() ?? ""
  const selectedProblem = resolvedSearchParams.problem ?? ""
  const selectedLocation = resolvedSearchParams.location?.trim().toLowerCase() ?? ""
  const selectedDateFrom = resolvedSearchParams.dateFrom ?? ""
  const selectedDateTo = resolvedSearchParams.dateTo ?? ""

  const scans = await prismaClient.scan.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const filteredScans = scans.filter((scan) => {
    const matchesQuery =
      !query ||
      scan.name.toLowerCase().includes(query) ||
      scan.phone.toLowerCase().includes(query)

    const matchesLocation =
      !selectedLocation || scan.location.toLowerCase().includes(selectedLocation)
    const matchesProblem = !selectedProblem || scan.problem === selectedProblem
    const matchesDate = matchesDateRange(
      scan.createdAt,
      selectedDateFrom,
      selectedDateTo,
    )

    return matchesQuery && matchesLocation && matchesProblem && matchesDate
  })

  const hairScans = filteredScans.filter((scan) => isHairProblem(scan.problem))
  const skinScans = filteredScans.filter((scan) => isSkinProblem(scan.problem))

  const renderScanGrid = (groupScans: typeof hairScans, groupTitle: string) => {
    if (groupScans.length === 0) {
      return null
    }

    return (
      <section className="rounded-3xl border border-border bg-card/60 p-5 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{groupTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {groupScans.length} {groupScans.length === 1 ? "record" : "records"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {groupScans.map((scan) => (
            <article
              key={scan.id}
              className="overflow-hidden rounded-2xl border border-border bg-background"
            >
              <div className="relative h-52 w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scan.imageData}
                  alt={`Scan of ${scan.name}`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  {problemLabels[scan.problem] ?? scan.problem}
                </span>
              </div>

              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{scan.name}</p>
                  <p className="text-xs text-muted-foreground">#{scan.id}</p>
                </div>
                <p className="text-sm text-muted-foreground">{scan.phone}</p>
                <p className="text-sm text-muted-foreground">{scan.location}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(scan.createdAt).toLocaleString()}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    )
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="border-b border-border pb-6">
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-muted-foreground">
            {filteredScans.length} filtered {filteredScans.length === 1 ? "record" : "records"}
            {" "}from {scans.length} total
          </p>
        </div>

        <form className="grid gap-4 rounded-3xl border border-border bg-card/60 p-5 shadow-sm md:grid-cols-4">
          <div className="md:col-span-2">
            <label
              htmlFor="dashboard-search"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Search by name or phone
            </label>
            <input
              id="dashboard-search"
              name="q"
              defaultValue={resolvedSearchParams.q ?? ""}
              placeholder="Search leads..."
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="dashboard-problem"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Concern
            </label>
            <select
              id="dashboard-problem"
              name="problem"
              defaultValue={selectedProblem}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary"
            >
              <option value="">All concerns</option>
              {allProblems.map((problem) => (
                <option key={problem} value={problem}>
                  {problemLabels[problem]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="dashboard-location"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Location
            </label>
            <select
              id="dashboard-location"
              name="location"
              defaultValue={resolvedSearchParams.location ?? ""}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary"
            >
              <option value="">All locations</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="dashboard-date-from"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Date from
            </label>
            <input
              id="dashboard-date-from"
              name="dateFrom"
              type="date"
              defaultValue={selectedDateFrom}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="dashboard-date-to"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Date to
            </label>
            <input
              id="dashboard-date-to"
              name="dateTo"
              type="date"
              defaultValue={selectedDateTo}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3 md:col-span-4">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Apply Filters
            </button>
            <a
              href={basePath}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Reset
            </a>
          </div>
        </form>

        {filteredScans.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground shadow-sm">
            No leads match the current filters.
          </div>
        ) : (
          <div className="space-y-6">
            {renderScanGrid(hairScans, "Hair Leads")}
            {renderScanGrid(skinScans, "Skin Leads")}
          </div>
        )}
      </div>
    </main>
  )
}

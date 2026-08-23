import fs from "fs"
import path from "path"
import { db } from "../src/lib/db"

interface Frontmatter {
  name?: string
  description?: string
  version?: string | number
  author?: string
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const rawYml = match[1]
  const body = match[2]
  const frontmatter: Frontmatter = {}

  for (const line of rawYml.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      let val = line.slice(colonIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (key === "name") frontmatter.name = val
      if (key === "description") frontmatter.description = val
      if (key === "version") frontmatter.version = val
    }
  }

  return { frontmatter, body }
}

function findSkillFiles(dir: string): string[] {
  let results: string[] = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(findSkillFiles(fullPath))
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(fullPath)
    }
  }
  return results
}

async function syncHermesSkills() {
  const skillsDir = path.join(process.cwd(), "skills", "hermes")
  const files = findSkillFiles(skillsDir)
  console.log(`Found ${files.length} Hermes skill definitions in ${skillsDir}`)

  let synced = 0
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8")
      const { frontmatter, body } = parseFrontmatter(content)

      const relativePath = path.relative(skillsDir, file)
      const folderCategory = relativePath.split(path.sep)[0] || "general"
      const skillName = frontmatter.name || path.basename(path.dirname(file))
      const slug = `hermes-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
      const description = frontmatter.description || `Hermes skill: ${skillName}`

      await db.agentSkill.upsert({
        where: { slug },
        create: {
          slug,
          name: `Hermes: ${skillName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
          description,
          content: body.slice(0, 3000), // First 3000 chars of instructions
          category: folderCategory,
          toolsJson: JSON.stringify([]),
          status: "active",
          version: 1,
          useCount: 1,
          successCount: 1,
          failureCount: 0,
        },
        update: {
          name: `Hermes: ${skillName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
          description,
          content: body.slice(0, 3000),
          category: folderCategory,
          status: "active",
        },
      })
      synced++
    } catch (err) {
      console.error(`Failed syncing skill ${file}:`, err)
    }
  }

  console.log(`Successfully synced ${synced} Hermes skills into database!`)
}

syncHermesSkills()
  .catch(console.error)
  .finally(() => db.$disconnect())

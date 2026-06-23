import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { defaultIssues } from "./src/data/defaultIssues";
import { Issue, IssueCategory, IssueStatus, IssueSeverity } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "issues-db.json");

// Middleware to parse JSON with larger payload limit for base64 images
app.use(express.json({ limit: "15mb" }));

// Helper to initialize database with default issues if not exist
function initializeDatabase(): Issue[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileData = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(fileData);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultIssues, null, 2), "utf-8");
      return defaultIssues;
    }
  } catch (error) {
    console.error("Error reading/writing issues-db.json:", error);
    return defaultIssues;
  }
}

// Function to save issues to file-based DB
function saveDatabase(issues: Issue[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(issues, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing to database file:", error);
  }
}

// Initialize state
let issues: Issue[] = initializeDatabase();

// 1. GET ALL ISSUES
app.get("/api/issues", (req, res) => {
  res.json({
    status: "ok",
    issues,
    aiModelUsed: process.env.GEMINI_API_KEY ? "gemini-3.5-flash" : "Fallback Keyword Rules Engine"
  });
});

// 2. CREATE A NEW ISSUE DIRECTLY
app.post("/api/issues", (req, res) => {
  const {
    title,
    description,
    category,
    location,
    imageUrl,
    reporterName,
    reporterEmail,
    severity,
    estimatedImpact,
    recommendedAction,
    aiGenerated
  } = req.body;

  if (!title || !description || !category || !location || !location.address) {
    return res.status(400).json({ error: "Missing required fields (title, description, category, address)" });
  }

  const newIssue: Issue = {
    id: `civic-${Date.now()}`,
    title: title.trim(),
    description: description.trim(),
    category: (category || "Other") as IssueCategory,
    location: {
      lat: Number(location.lat || 45.097),
      lng: Number(location.lng || -93.398),
      address: location.address
    },
    status: "Pending" as IssueStatus,
    severity: (severity || "Medium") as IssueSeverity,
    estimatedImpact: estimatedImpact || "Awaiting professional evaluation.",
    recommendedAction: recommendedAction || "Awaiting department triage.",
    imageUrl: imageUrl || undefined,
    votes: 0,
    votedUsers: [],
    verifications: 0,
    verifiedUsers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [
      {
        status: "Pending",
        updatedAt: new Date().toISOString(),
        comment: `Issue reported by community member: ${reporterName || "Anonymous"}`
      }
    ],
    aiGenerated: !!aiGenerated,
    reporterName: reporterName || "Anonymous",
    reporterEmail: reporterEmail || "anonymous@civicconnect.net"
  };

  issues.unshift(newIssue);
  saveDatabase(issues);

  res.status(201).json({ status: "ok", issue: newIssue });
});

// 3. VOTE TOGGLE
app.post("/api/issues/:id/vote", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing voter identification" });
  }

  const issueIndex = issues.findIndex((i) => i.id === id);
  if (issueIndex === -1) {
    return res.status(404).json({ error: "Issue not found" });
  }

  const issue = issues[issueIndex];
  const userVoteIndex = issue.votedUsers.indexOf(userId);

  if (userVoteIndex > -1) {
    // Already voted, remove vote (toggle off)
    issue.votedUsers.splice(userVoteIndex, 1);
    issue.votes = Math.max(0, issue.votes - 1);
  } else {
    // Add vote (toggle on)
    issue.votedUsers.push(userId);
    issue.votes += 1;
  }

  issue.updatedAt = new Date().toISOString();
  saveDatabase(issues);
  res.json({ status: "ok", votes: issue.votes, votedUsers: issue.votedUsers });
});

// 4. VERIFY TOGGLE
app.post("/api/issues/:id/verify", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing verifier identification" });
  }

  const issueIndex = issues.findIndex((i) => i.id === id);
  if (issueIndex === -1) {
    return res.status(404).json({ error: "Issue not found" });
  }

  const issue = issues[issueIndex];
  const verIndex = issue.verifiedUsers.indexOf(userId);

  if (verIndex > -1) {
    // Already verified, toggle off
    issue.verifiedUsers.splice(verIndex, 1);
    issue.verifications = Math.max(0, issue.verifications - 1);
  } else {
    // Toggle on
    issue.verifiedUsers.push(userId);
    issue.verifications += 1;
  }

  issue.updatedAt = new Date().toISOString();
  saveDatabase(issues);
  res.json({ status: "ok", verifications: issue.verifications, verifiedUsers: issue.verifiedUsers });
});

// 5. UPDATE STATUS (ADMIN OR LOCAL REPAIR UPDATER)
app.post("/api/issues/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Missing target status" });
  }

  const issueIndex = issues.findIndex((i) => i.id === id);
  if (issueIndex === -1) {
    return res.status(404).json({ error: "Issue not found" });
  }

  const issue = issues[issueIndex];
  issue.status = status as IssueStatus;
  issue.updatedAt = new Date().toISOString();
  issue.history.push({
    status: status as IssueStatus,
    updatedAt: new Date().toISOString(),
    comment: comment || `Status updated to ${status}`
  });

  saveDatabase(issues);
  res.json({ status: "ok", issue });
});

// 6. GEMINI AND FALLBACK AI ENDPOINT
function fallbackAnalyze(description: string): any {
  const desc = description.toLowerCase();
  
  let category: IssueCategory = "Other";
  let severity: IssueSeverity = "Medium";
  let estimatedImpact = "Presents potential pedestrian/vehicle disruptions, awaiting public triage.";
  let recommendedAction = "Dispatch municipal road safety team to inspect site and schedule standard resolution workflows.";
  let title = "Reported Public Hazard";

  if (desc.includes("pothole") || desc.includes("road") || desc.includes("asphalt") || desc.includes("pavement")) {
    category = "Pothole";
    title = "Dangerous Roadway Pothole";
    severity = desc.includes("deep") || desc.includes("large") || desc.includes("highway") ? "High" : "Medium";
    estimatedImpact = "Swerving hazard for traffic, risking rim blowouts or suspension failure.";
    recommendedAction = "Apply a quick asphalt fill and evaluate the road base for general micro-resurfacing.";
  } else if (desc.includes("leak") || desc.includes("water") || desc.includes("burst") || desc.includes("flood") || desc.includes("hydrant")) {
    category = "Water Leak";
    title = "Significant Water Leakage";
    severity = desc.includes("gushing") || desc.includes("flood") || desc.includes("main") ? "Critical" : "High";
    estimatedImpact = "Erosion of soil sub-base, loss of local water pressure, and environmental flooding risk.";
    recommendedAction = "Inspect local water main valves, isolate the leak to prevent further damage, and swap the busted pipe section.";
  } else if (desc.includes("streetlight") || desc.includes("lamp") || desc.includes("dark") || desc.includes("bulb") || desc.includes("crosswalk")) {
    category = "Streetlight";
    title = "Dark Streetlight Hazard";
    severity = desc.includes("crosswalk") || desc.includes("school") || desc.includes("junction") ? "High" : "Low";
    estimatedImpact = "Diminished visibility for motor vehicles and pedestrians, increasing theft threats and crossing accidents.";
    recommendedAction = "Dispatch public works electrical department to swap light sensor/bulb and upgrade socket to LED.";
  } else if (desc.includes("dump") || desc.includes("waste") || desc.includes("trash") || desc.includes("mattress") || desc.includes("garbage")) {
    category = "Waste Dumping";
    title = "Illegal Domestic Waste Dumping";
    severity = desc.includes("chemical") || desc.includes("battery") || desc.includes("oil") ? "High" : "Medium";
    estimatedImpact = "Visual decay of parkland, pest attraction, and environmental toxic leakage into surrounding storm drains.";
    recommendedAction = "Schedule municipal sanitation team with flatbed trailer to clear bulky wastes and install fine signs.";
  } else if (desc.includes("bench") || desc.includes("park") || desc.includes("sidewalk") || desc.includes("sign") || desc.includes("railing") || desc.includes("bridge")) {
    category = "Public Infrastructure";
    title = "Damaged Public Infrastructure";
    severity = desc.includes("collapse") || desc.includes("broken") || desc.includes("unsafe") ? "High" : "Medium";
    estimatedImpact = "Inconvenience to families, children, or elderly residents. Risk of slips, trips, or structural compromise.";
    recommendedAction = "Block the immediate structural vicinity with security tape and dispatch carpentry or concrete repairs.";
  }

  // Refine title to look professional based on context
  if (description.length > 5 && description.length < 50) {
    title = description.substring(0, 35) + (description.length > 35 ? "..." : "");
  }

  return {
    category,
    title,
    severity,
    estimatedImpact,
    recommendedAction,
    isFallback: true
  };
}

app.post("/api/issues/analyze", async (req, res) => {
  const { description, imageBase64 } = req.body;

  if (!description) {
    return res.status(400).json({ error: "Missing issue description for analysis" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    console.log("GEMINI_API_KEY is not defined. Initializing fallback analysis rule-engine.");
    const fallback = fallbackAnalyze(description);
    return res.json({ success: true, ...fallback });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const parts: any[] = [
      {
        text: `Analyze this description and optional accompanying photo of a local civic hazard or municipal maintenance issue. 
        You MUST diagnose the issue and return a structured JSON response.
        
        The standard categories you are restricted to are exactly: 
        'Pothole' | 'Water Leak' | 'Streetlight' | 'Waste Dumping' | 'Public Infrastructure' | 'Other'
        
        The standard severities are exactly:
        'Low' | 'Medium' | 'High' | 'Critical'
        
        Generate:
        1. 'category': Selected from the standard list above.
        2. 'title': A short, clear title summarizing the issue (5-8 words max).
        3. 'severity': Selected from the standard list above.
        4. 'estimatedImpact': A professional, technical explanation (1-2 sentences) of the real hazard to traffic, pedestrians, local resources, or properties.
        5. 'recommendedAction': Actionable immediate steps for the municipal response department to safely triage and remedy the problem.

        Return exactly raw JSON conforming to the structured schema.`
      },
      { text: `Citizen Description: "${description}"` }
    ];

    if (imageBase64) {
      // Clean up base64 prefix
      let cleanData = imageBase64;
      let mimeType = "image/png";
      if (imageBase64.includes(";base64,")) {
        const partsSplit = imageBase64.split(";base64,");
        cleanData = partsSplit[1];
        const mimePart = partsSplit[0].split(":");
        if (mimePart.length > 1) {
          mimeType = mimePart[1];
        }
      }

      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanData
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: "Must be exactly one of: 'Pothole', 'Water Leak', 'Streetlight', 'Waste Dumping', 'Public Infrastructure', 'Other'"
            },
            title: {
              type: Type.STRING,
              description: "Concise summary title (5-8 words)."
            },
            severity: {
              type: Type.STRING,
              description: "Must be exactly one of: 'Low', 'Medium', 'High', 'Critical'"
            },
            estimatedImpact: {
              type: Type.STRING,
              description: "Concrete threat analysis of how failure affects neighborhood safety or property."
            },
            recommendedAction: {
              type: Type.STRING,
              description: "Optimal engineering or utility dispatch action."
            }
          },
          required: ["category", "title", "severity", "estimatedImpact", "recommendedAction"]
        }
      }
    });

    const bodyText = response.text;
    if (!bodyText) {
      throw new Error("Empty response from Gemini AI");
    }

    const parsed = JSON.parse(bodyText.trim());
    res.json({
      success: true,
      category: parsed.category,
      title: parsed.title,
      severity: parsed.severity,
      estimatedImpact: parsed.estimatedImpact,
      recommendedAction: parsed.recommendedAction,
      isFallback: false
    });

  } catch (error: any) {
    console.error("Gemini AI API call failed. Falling back to local rule analyzer.", error);
    const fallback = fallbackAnalyze(description);
    res.json({
      success: true,
      ...fallback,
      errorInfo: error instanceof Error ? error.message : "Standard Gemini API exception"
    });
  }
});

// START EXPRESS SERVER WITH VITE MIDDLEWARE
async function startServer() {
  // Vite integration for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CivicConnect AI Fullstack Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();

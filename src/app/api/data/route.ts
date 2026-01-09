import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "cafes";

    try {
        let fileName = "";
        let delimiter = ",";

        if (type === "cafes") fileName = "cafe_info.csv";
        else if (type === "properties") fileName = "idealista.csv";
        else if (type === "data") {
            fileName = "data.csv";
            delimiter = ";"; // data.csv uses semicolon delimiter
        }
        else if (type === "other") fileName = "other.csv";

        if (!fileName) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

        const filePath = path.join(process.cwd(), fileName);
        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter,
            relax_column_count: true,
        });

        return NextResponse.json(records);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

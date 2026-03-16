import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (
          !pathname.startsWith("coverage/") &&
          !pathname.startsWith("sales/")
        ) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ["text/csv", "application/vnd.ms-excel"],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async () => {
        // no-op
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Blob upload setup failed",
        detail: String(error),
      },
      { status: 400 }
    );
  }
}
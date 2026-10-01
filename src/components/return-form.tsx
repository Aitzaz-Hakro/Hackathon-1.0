"use client";

import { useActionState, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { recordReturn } from "@/lib/actions/issues";

/**
 * Downscales a picked image to a small JPEG data URL before it ever reaches
 * the Server Action.
 *
 * Storing the image inline in `issues.damage_image_url` keeps the demo free of
 * a Supabase Storage bucket and policy setup. The client-side resize keeps the
 * payload far under the 1MB action body limit.
 */
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not decode that image."));
    element.src = dataUrl;
  });

  const maxDimension = 800;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) return dataUrl;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

const CONDITIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair — minor wear" },
  { value: "damaged", label: "Damaged" },
  { value: "missing_parts", label: "Missing parts" },
  { value: "not_returned", label: "Not returned" },
];

export function ReturnForm({ issueId }: { issueId: string }) {
  const [state, formAction, pending] = useActionState(recordReturn, null);
  const [damageImage, setDamageImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="damageImage" value={damageImage ?? ""} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`condition-${issueId}`}>Return condition</Label>
          <NativeSelect id={`condition-${issueId}`} name="condition" defaultValue="good">
            {CONDITIONS.map((condition) => (
              <option key={condition.value} value={condition.value}>
                {condition.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`remarks-${issueId}`}>Remarks</Label>
          <Input id={`remarks-${issueId}`} name="remarks" placeholder="Optional note" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 hover:text-foreground">
          {imageBusy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="size-3.5" aria-hidden />
          )}
          {damageImage ? "Replace photo" : "Add damage photo"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setImageBusy(true);
              try {
                setDamageImage(await downscaleImage(file));
              } catch {
                setDamageImage(null);
              } finally {
                setImageBusy(false);
              }
            }}
          />
        </label>
        {damageImage ? (
          // A tiny preview is intentional — eslint's next/image rule is for
          // content images, not a local blob preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={damageImage} alt="Damage preview" className="h-10 w-10 rounded-md border object-cover" />
        ) : null}
      </div>

      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-xs text-success">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending || imageBusy}>
        {pending ? "Recording…" : "Record return"}
      </Button>
    </form>
  );
}

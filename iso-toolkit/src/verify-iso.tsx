import { Action, ActionPanel, Form, Toast, showToast } from "@vicinae/api";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { useState } from "react";

export default function VerifyIsoCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);
  const [algo, setAlgo] = useState("sha256");
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState("");

  const handleSubmit = async () => {
    const selected = isoPath[0];
    if (!selected) {
      await showToast(Toast.Style.Failure, "Select an ISO file");
      return;
    }

    const toast = await showToast(Toast.Style.Animated, "Computing hash…");
    const hash = await new Promise<string>((resolve, reject) => {
      const h = createHash(algo);
      const stream = createReadStream(selected);
      stream.on("data", (chunk) => h.update(chunk));
      stream.on("end", () => resolve(h.digest("hex")));
      stream.on("error", reject);
    });

    setResult(hash);
    toast.style = Toast.Style.Success;
    toast.title = `${algo.toUpperCase()}: ${hash}`;
    if (expected.trim()) {
      const match = expected.trim().toLowerCase() === hash;
      toast.message = match ? "Hash matches" : "Hash mismatch";
      toast.style = match ? Toast.Style.Success : Toast.Style.Failure;
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Compute Hash" onSubmit={handleSubmit} />
          {result && <Action.CopyToClipboard title="Copy Hash" content={result} />}
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="iso"
        title="ISO file"
        allowMultipleSelection={false}
        canChooseFiles
        canChooseDirectories={false}
        value={isoPath}
        onChange={setIsoPath}
      />
      <Form.Dropdown id="algo" title="Algorithm" value={algo} onChange={setAlgo}>
        <Form.Dropdown.Item title="SHA-256" value="sha256" />
        <Form.Dropdown.Item title="SHA-1" value="sha1" />
        <Form.Dropdown.Item title="MD5" value="md5" />
      </Form.Dropdown>
      <Form.TextField
        id="expected"
        title="Expected hash (optional)"
        value={expected}
        onChange={setExpected}
      />
      {result && <Form.Description text={`Result: ${result}`} />}
    </Form>
  );
}

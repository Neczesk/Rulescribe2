import { FileButton } from "@mantine/core";
import type { Editor } from "@tiptap/core";
import { prepareImageInsert } from "../extensions/image-block/insertImage";
import { IconImage } from "../icons";
import { ToolbarButton } from "./ToolbarButton";

interface ImageToolbarButtonProps {
  editor: Editor | null;
}

export function ImageToolbarButton({ editor }: ImageToolbarButtonProps) {
  const onFile = async (file: File | null) => {
    if (!file || !editor) return;
    const attrs = await prepareImageInsert(file);
    editor.chain().focus().insertImageBlock(attrs).run();
  };

  return (
    <FileButton onChange={onFile} accept="image/*">
      {(props) => (
        <ToolbarButton
          icon={<IconImage />}
          label="Image"
          aria-label="Insert image"
          onClick={props.onClick}
        />
      )}
    </FileButton>
  );
}

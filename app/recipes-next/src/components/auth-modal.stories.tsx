import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { AuthModal } from "@/components/auth-modal";

function AuthModalDemo() {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  return (
    <div>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        Open auth modal
      </button>
      <AuthModal
        open={open}
        mode={mode}
        onClose={() => setOpen(false)}
        onModeChange={setMode}
      />
    </div>
  );
}

const meta = {
  title: "KitchenOS/AuthModal",
  component: AuthModal,
  tags: ["autodocs"],
} satisfies Meta<typeof AuthModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
  args: {} as never,
  render: () => <AuthModalDemo />,
};

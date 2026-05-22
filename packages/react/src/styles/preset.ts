export const nozlePreset = {
  theme: {
    extend: {
      colors: {
        nozle: {
          normal: "#22c55e",
          warning: "#f59e0b",
          critical: "#ef4444",
        },
      },
    },
  },
  plugins: [
    function nozlePlugin({
      addComponents,
    }: {
      addComponents: (
        components: Record<string, Record<string, string>>
      ) => void;
    }) {
      addComponents({
        '[data-nozle="usage-meter"][data-variant="bar"]': {
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        },
        '[data-nozle="usage-meter-track"]': {
          height: "0.5rem",
          borderRadius: "9999px",
          backgroundColor: "#e5e7eb",
          overflow: "hidden",
        },
        '[data-nozle="usage-meter-fill"]': {
          height: "100%",
          borderRadius: "9999px",
          transition: "width 300ms ease",
        },
        '[data-nozle="usage-meter"][data-level="normal"] [data-nozle="usage-meter-fill"]':
          {
            backgroundColor: "#22c55e",
          },
        '[data-nozle="usage-meter"][data-level="warning"] [data-nozle="usage-meter-fill"]':
          {
            backgroundColor: "#f59e0b",
          },
        '[data-nozle="usage-meter"][data-level="critical"] [data-nozle="usage-meter-fill"]':
          {
            backgroundColor: "#ef4444",
          },
        '[data-nozle="plan-badge"][data-variant="pill"]': {
          display: "inline-flex",
          alignItems: "center",
          padding: "0.125rem 0.5rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: "500",
          backgroundColor: "#e0f2fe",
          color: "#0369a1",
        },
        '[data-nozle="upgrade-prompt"][data-variant="card"]': {
          padding: "1rem",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
          backgroundColor: "#fefce8",
        },
        '[data-nozle="upgrade-prompt"][data-variant="banner"]': {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          backgroundColor: "#fef3c7",
          borderRadius: "0.375rem",
        },
      });
    },
  ],
};

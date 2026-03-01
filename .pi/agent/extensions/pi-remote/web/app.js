import { html } from "./html.js";
import { useRouter } from "./router.js";
import { SessionList } from "./components/session-list.js";
import { SessionView } from "./components/session-view.js";

const App = () => {
  const { route } = useRouter();

  if (route.view === "session") {
    return html`<${SessionView} host=${route.host} port=${route.port} />`;
  }

  return html`<${SessionList} />`;
};

export default App;

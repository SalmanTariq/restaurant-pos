import { FormEvent, useEffect, useState } from "react";
import { usePos } from "../pos-store";
import { CATALOG_OFFLINE_ERROR } from "../till-merge";
import { readLogoFile } from "../settings";

export function SettingsScreen() {
  const { settings, updateSettings, canAmendCatalog } = usePos();
  const [name, setName] = useState(settings.restaurantName);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    setName(settings.restaurantName);
  }, [settings.restaurantName]);

  function onSaveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    updateSettings({ restaurantName: next });
    setName(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoError("");
    try {
      const logoDataUrl = await readLogoFile(file);
      updateSettings({ logoDataUrl });
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "Could not use that image.");
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="subhead">
            Restaurant name and logo appear on the till and on printed bills.
            {!canAmendCatalog ? ` ${CATALOG_OFFLINE_ERROR}` : ""}
          </p>
        </div>
      </div>

      <form className="login-card users-form settings-card" onSubmit={onSaveName}>
        <fieldset disabled={!canAmendCatalog}>
        <h2>Restaurant</h2>
        <label htmlFor="settings-name">Name</label>
        <input
          id="settings-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <button className="btn-tandoor" type="submit">
          Save name
        </button>
        {saved ? <p className="settings-saved">Name saved</p> : null}

        <h2 className="settings-block">Logo</h2>
        <div className="logo-row">
          {settings.logoDataUrl ? (
            <img className="logo-preview" src={settings.logoDataUrl} alt="Restaurant logo" />
          ) : (
            <span className="logo-preview is-empty" aria-hidden="true" />
          )}
          <div className="logo-actions">
            <label className="cook-edit logo-file">
              {settings.logoDataUrl ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void onLogo(file);
                }}
              />
            </label>
            {settings.logoDataUrl ? (
              <button
                type="button"
                className="text-btn"
                onClick={() => updateSettings({ logoDataUrl: null })}
              >
                Remove logo
              </button>
            ) : null}
            <p className="subhead">PNG or JPG. Used on the till and at the top of guest bills.</p>
          </div>
        </div>
        {logoError ? (
          <p className="auth-error" role="alert">
            {logoError}
          </p>
        ) : null}
        </fieldset>
      </form>

      <section className="login-card users-form settings-card">
        <fieldset disabled={!canAmendCatalog}>
        <h2>Till options</h2>
        <label className="check-row" htmlFor="settings-petty">
          <input
            id="settings-petty"
            type="checkbox"
            checked={settings.requirePettyCash}
            onChange={(event) =>
              updateSettings({ requirePettyCash: event.currentTarget.checked })
            }
          />
          Ask for petty cash when the day starts
        </label>
        <label className="check-row" htmlFor="settings-stock">
          <input
            id="settings-stock"
            type="checkbox"
            checked={settings.useInventory}
            onChange={(event) =>
              updateSettings({ useInventory: event.currentTarget.checked })
            }
          />
          Track kitchen stock on the till
        </label>
        <p className="subhead">
          Turn stock off if the kitchen does not count portions. The order screen
          hides remaining counts. Inventory stays so you can edit dishes.
        </p>
        <label className="check-row" htmlFor="settings-tables">
          <input
            id="settings-tables"
            type="checkbox"
            checked={settings.useTables}
            onChange={(event) =>
              updateSettings({ useTables: event.currentTarget.checked })
            }
          />
          Show tables and dine-in
        </label>
        <p className="subhead">
          Turn this off for takeaway-only shops. The Tables tab and dine-in toggle
          stay hidden on the till.
        </p>
        </fieldset>
      </section>
    </main>
  );
}

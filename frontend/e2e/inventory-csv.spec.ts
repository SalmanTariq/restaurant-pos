import { expect, test } from "@playwright/test";
import {
  buildInventoryZip,
  inventoryPhotoPath,
  inventoryToCsv,
  mergeInventoryCsv,
  readInventoryImport,
} from "../src/inventory-csv";
import { unzipStore } from "../src/zip-store";
import type { MenuItem } from "../src/pos-types";

const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function dish(id: string, name: string, photo: string | null): MenuItem {
  return {
    id,
    name,
    nameUrdu: "",
    category: "Karahi",
    price: 100,
    stock: 4,
    active: true,
    imageDataUrl: photo,
  };
}

test.describe("inventory archive", () => {
  test("csv lists photo files instead of embedding data URLs", () => {
    const csv = inventoryToCsv([dish("roti", "Roti", PHOTO)]);
    expect(csv).toContain("photos/roti.png");
    expect(csv).not.toContain("data:image");
    expect(inventoryPhotoPath(dish("roti", "Roti", PHOTO))).toBe("photos/roti.png");
  });

  test("zip keeps a file for every dish photo", () => {
    const menu = [
      dish("roti", "Roti", PHOTO),
      dish("karahi", "Karahi", PHOTO),
      dish("water", "Water", null),
    ];
    const files = unzipStore(buildInventoryZip(menu));
    const names = files.map((entry) => entry.name).sort();
    expect(names).toEqual(["menu.csv", "photos/karahi.png", "photos/roti.png"]);
  });

  test("importing the zip restores photos onto matching dishes", async () => {
    const menu = [dish("roti", "Roti", PHOTO), dish("karahi", "Karahi", PHOTO)];
    const zip = buildInventoryZip(menu);
    const file = new File([zip], "menu.zip", { type: "application/zip" });
    const imported = await readInventoryImport(file);
    const merged = mergeInventoryCsv(
      [dish("roti", "Roti", null), dish("karahi", "Karahi", null)],
      imported.csv,
      imported.photos,
    );
    expect(merged.updated).toBe(2);
    expect(merged.menu[0].imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(merged.menu[1].imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

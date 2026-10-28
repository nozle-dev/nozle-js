/** A page with the cursor of the next one; `next_cursor` is null on the last page. */
type CursorPage = { next_cursor: string | null };

/**
 * Yields every item of a cursor-paginated list, fetching the next page when the previous one is used up.
 * `fetchPage` gets the cursor (`start` for the first page) and `items` picks the page's rows.
 */
export async function* paginate<Page extends CursorPage, Item>(
  fetchPage: (cursor: string | undefined) => Promise<Page>,
  items: (page: Page) => Item[],
  start?: string,
): AsyncGenerator<Item, void, undefined> {
  let cursor = start;
  do {
    const page = await fetchPage(cursor);
    yield* items(page);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
}

package catalogue.search;

import catalogue.model.Book;
import catalogue.repo.ShelfRepository;

public class TitleSearch {
  private final ShelfRepository source;

  public TitleSearch(ShelfRepository source) {
    this.source = source;
  }

  public Book firstContaining(String fragment) {
    for (Book cursor = source.head(); cursor != null; cursor = cursor.nextOnShelf) {
      if (cursor.heading.contains(fragment)) return cursor;
    }
    return null;
  }
}

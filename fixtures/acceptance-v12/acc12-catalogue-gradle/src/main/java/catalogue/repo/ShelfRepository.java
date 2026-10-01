package catalogue.repo;

import catalogue.model.Book;

public class ShelfRepository {
  private Book firstBook;
  private int stored;

  public void store(Book book) {
    book.nextOnShelf = firstBook;
    firstBook = book;
    stored = stored + 1;
  }

  public Book head() {
    return firstBook;
  }

  public int storedCount() {
    return stored;
  }
}

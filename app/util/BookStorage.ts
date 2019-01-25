import { AsyncStorage } from "react-native";
import RNFS from "react-native-fs";
import { unzip } from "react-native-zip-archive";
import { Book, Shelf, BookOrShelf, listForShelf } from "../models/BookOrShelf";
import { BookCollection } from "../models/BookCollection";
import { nameFromPath } from "./FileUtil";

const booksDir = RNFS.DocumentDirectoryPath + "/books";
const thumbsDir = RNFS.DocumentDirectoryPath + "/thumbs";
const openBookDir = RNFS.DocumentDirectoryPath + "/openBook";
const keyPrefix = "bloomreader.books.";
const bookListKey = keyPrefix + "books";
const shelfListKey = keyPrefix + "shelves";

export async function createDirectories(): Promise<void> {
  await RNFS.mkdir(booksDir);
  await RNFS.mkdir(thumbsDir);
}

export async function importBookFile(
  filename: string
): Promise<BookCollection> {
  const bookList = (await readList(bookListKey)) as Book[];
  const book = await addBookToList(filename, bookList);
  writeList(bookListKey, bookList);
  return {
    book: book,
    books: bookList,
    shelves: (await readList(shelfListKey)) as Shelf[]
  };
}

async function addBookToList(filename: string, list: Book[]): Promise<Book> {
  const tmpBookPath = await extractBookToTmp(filename);
  const thumbPath = await saveThumbnail(tmpBookPath);
  const metaData = JSON.parse(await RNFS.readFile(`${tmpBookPath}/meta.json`));
  RNFS.unlink(tmpBookPath);
  const existingBookIndex = list.findIndex(book => book.filename == filename);
  if (existingBookIndex >= 0) list.splice(existingBookIndex, 1);
  const book = {
    filename: filename,
    title: metaData.title,
    allTitles: JSON.parse(metaData.allTitles),
    tags: metaData.tags,
    thumbPath: thumbPath,
    modifiedAt: Date.now()
  };
  list.push(book);
  return book;
}

export async function importBooksDir(
  filepath: string
): Promise<BookCollection> {
  const collection = await getBookCollection();
  const files = await RNFS.readDir(filepath);
  for (let i = 0; i < files.length; ++i) {
    const file = files[i];
    if (file.name.endsWith(".bloomd")) {
      await RNFS.moveFile(file.path, `${booksDir}/${file.name}`);
      await addBookToList(file.name, collection.books);
    } else if (file.name.endsWith(".bloomshelf")) {
      const shelfInfo = JSON.parse(await RNFS.readFile(file.path));
      addShelfToList(shelfInfo, collection.shelves);
    }
  }
  RNFS.unlink(filepath);
  writeCollection(collection);
  return collection;
}

function addShelfToList(newShelf: Shelf, list: Shelf[]): void {
  newShelf.isShelf = true;
  const existingShelfIndex = list.findIndex(shelf => shelf.id == newShelf.id);
  if (existingShelfIndex >= 0) list.splice(existingShelfIndex, 1);
  list.push(newShelf);
}

export async function getBookCollection(): Promise<BookCollection> {
  return {
    books: (await readList(bookListKey)) as Book[],
    shelves: (await readList(shelfListKey)) as Shelf[]
  };
}

export async function openBookForReading(book: Book): Promise<string> {
  return await unzip(bookPath(book), openBookDir);
}

export async function getThumbnail(
  book: Book
): Promise<{ data: string; format: string } | undefined> {
  if (!book.thumbPath) return undefined;
  return {
    data: await RNFS.readFile(book.thumbPath, "base64"),
    format: book.thumbPath
      .slice(book.thumbPath.lastIndexOf(".") + 1)
      .toLocaleLowerCase()
  };
}

export async function fetchHtml(): Promise<string> {
  const fileList = await RNFS.readDir(openBookDir);
  const htmlFile = fileList.find(entry => /\.html?$/.test(entry.name));
  return htmlFile ? await RNFS.readFile(htmlFile.path) : "";
}

export async function deleteItem(item: BookOrShelf): Promise<BookCollection> {
  let collection = await getBookCollection();
  collection = await deleteBookOrShelf(item, collection);
  writeCollection(collection);
  return collection;
}

async function deleteBookOrShelf(
  item: BookOrShelf,
  collection: BookCollection
): Promise<BookCollection> {
  return item.isShelf
    ? deleteShelf(item as Shelf, collection)
    : deleteBook(item as Book, collection);
}

async function deleteBook(
  book: Book,
  collection: BookCollection
): Promise<BookCollection> {
  collection.books = collection.books.filter(b => b.filename != book.filename);
  RNFS.unlink(bookPath(book));
  return collection;
}

async function deleteShelf(
  shelf: Shelf,
  collection: BookCollection
): Promise<BookCollection> {
  const deleteList = listForShelf(shelf, collection);
  for (let i = 0; i < deleteList.length; ++i)
    collection = await deleteBookOrShelf(deleteList[i], collection);
  collection.shelves = collection.shelves.filter(s => s.id != shelf.id);
  return collection;
}

function bookPath(book: Book): string {
  return booksDir + "/" + book.filename;
}

function bookNameFromFilename(filename: string): string {
  return filename.replace(/\.bloomd$/, "");
}

async function readList(key: string): Promise<BookOrShelf[]> {
  const listJson = await AsyncStorage.getItem(key);
  return listJson ? JSON.parse(listJson) : [];
}

async function writeList(key: string, list: object[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

async function writeCollection(collection: BookCollection): Promise<void> {
  writeList(bookListKey, collection.books);
  writeList(shelfListKey, collection.shelves);
}

async function extractBookToTmp(filename: string): Promise<string> {
  const inPath = `${booksDir}/${filename}`;
  const outPath = `${RNFS.CachesDirectoryPath}/${filename}_FILES`;
  return await unzip(inPath, outPath);
}

async function saveThumbnail(bookPath: string): Promise<string | undefined> {
  const fileList = await RNFS.readdir(bookPath);
  const thumbFilename = fileList.find(filename =>
    filename.startsWith("thumbnail.")
  );
  if (thumbFilename) {
    const inPath = bookPath + "/" + thumbFilename;
    let outPath =
      thumbsDir + "/" + bookNameFromFilename(nameFromPath(bookPath));
    await RNFS.mkdir(outPath);
    outPath += "/" + thumbFilename;
    await RNFS.moveFile(inPath, outPath);
    return outPath;
  }
}
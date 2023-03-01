/**



*/
import React from 'react'
import { Media } from '../../packages/core'
import { Folder, File } from '../../packages/icons'
import { Button, IconButton } from '../../packages/styles'
import { TrashIcon } from '../../packages/icons'
import { BiArrowToBottom } from 'react-icons/bi'

interface MediaItemProps {
  item: Media
  onClick(_item: Media): void
  onSelect?(_item: Media): void
  onDelete?(_item: Media): void
}

export function ListMediaItem({
  item,
  onClick,
  onSelect,
  onDelete,
}: MediaItemProps) {
  const FileIcon = item.type === 'dir' ? Folder : File
  return (
    <li
      className={
        'flex gap-3 items-center py-2 pl-2 pr-3 bg-white transition duration-150 ease-out hover:bg-white/50 ' +
        (item.type === 'dir' ? 'cursor-pointer' : '')
      }
      onClick={() => onClick(item)}
    >
      <div className="w-20 h-20 border border-gray-100 rounded overflow-hidden flex justify-center flex-shrink-0">
        {item.thumbnail ? (
          <img
            className="object-cover w-full h-full object-center"
            src={item.thumbnail}
            alt={item.filename}
          />
        ) : (
          <FileIcon className="w-[47%] h-full fill-gray-300" />
        )}
      </div>
      <Filename>{item.filename}</Filename>
      <div className="flex justify-end gap-3 items-center group transition duration-150 ease-out opacity-70 hover:opacity-100">
        {onSelect && item.type === 'file' && (
          <Button size="medium" variant="white" onClick={() => onSelect(item)}>
            Insert{' '}
            <BiArrowToBottom className="ml-1 -mr-0.5 w-6 h-auto text-blue-500 opacity-70" />
          </Button>
        )}
        {onDelete && item.type === 'file' && (
          <IconButton
            variant="ghost"
            size="medium"
            onClick={() => onDelete(item)}
          >
            <TrashIcon className="w-6 h-auto" />
          </IconButton>
        )}
      </div>
    </li>
  )
}

const Filename = ({ className = '', ...props }) => (
  <span
    className={'text-base flex-grow w-full break-words truncate ' + className}
    {...props}
  />
)

export function GridMediaItem({ item, active, onClick }) {
  const FileIcon = item.type === 'dir' ? Folder : File
  return (
    <li
      className={`relative aspect-w-1 aspect-h-1 border border-gray-100 rounded-md overflow-hidden flex justify-center flex-shrink-0 transition duration-150 ease-out ${
        active
          ? 'shadow-outline'
          : 'shadow hover:shadow-md hover:scale-103 hover:border-gray-150'
      } ${item.type === 'dir' ? 'cursor-pointer' : ''}`}
    >
      <button
        className="absolute w-full h-full"
        onClick={() => {
          if (!active) {
            onClick(item)
          } else {
            onClick(false)
          }
        }}
      >
        {item.thumbnail ? (
          <img
            className="object-cover w-full h-full object-center"
            src={item.thumbnail}
            alt={item.filename}
          />
        ) : (
          <FileIcon className="w-[47%] h-full fill-gray-300" />
        )}
      </button>
    </li>
  )
}

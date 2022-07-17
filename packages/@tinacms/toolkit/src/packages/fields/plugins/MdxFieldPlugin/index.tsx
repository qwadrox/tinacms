/**

Copyright 2021 Forestry.io Holdings, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

import React from 'react'
import { wrapFieldsWithMeta } from '../wrapFieldWithMeta'
import RawEditor from './monaco'
import { RichEditor } from './plate'
import { EditorContext } from './plate/editor-context'

// TODO: RawEditor is large since it comes with the mdx stuff.
// Either lazy load from a CDN like this package https://github.com/suren-atoyan/monaco-loader#readme
// Or lazy load via suspense and force all users of Tina to support ESM
// const RawEditor = React.lazy(() => import('./monaco'))

// TODO: there's an issue where void node values don't get updated if the editor hasn't been focused from another node first.
// https://github.com/udecode/plate/issues/1519#issuecomment-1184933602

export const MdxFieldPlugin = {
  name: 'rich-text',
  Component: wrapFieldsWithMeta((props) => {
    const [rawMode, setRawMode] = React.useState(false)
    const [key, setKey] = React.useState(0)

    /**
     * Since slate keeps track of it's own state, and that state is an object rather
     * than something easily memoizable like a string it can be tricky to ensure
     * resets are properly handled. So we sneak in a callback to the form's reset
     * logic that just remounts slate entirely
     */
    React.useMemo(() => {
      const { reset } = props.form
      props.form.reset = (initialValues) => {
        setKey((key) => key + 1)
        return reset(initialValues)
      }
    }, [])

    return (
      <EditorContext.Provider
        key={key}
        value={{ templates: props.field.templates, rawMode, setRawMode }}
      >
        <div
          className={
            'min-h-[100px] max-w-full tina-prose relative shadow-inner focus-within:shadow-outline focus-within:border-blue-500 block w-full bg-white border border-gray-200 text-gray-600 focus-within:text-gray-900 rounded-md px-3 py-2 mb-5'
          }
        >
          {rawMode ? <RawEditor {...props} /> : <RichEditor {...props} />}
        </div>
      </EditorContext.Provider>
    )
  }),
}
